// utils/withdrawalRecovery.js
const mongoose = require("mongoose");
const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");
const WithdrawalOperation = require("../models/WithdrawalOperation");
const sendMail = require("./sendMail");

let _supportsTransactionsCache = null;

/**
 * Dynamically probe whether the current MongoDB deployment supports
 * multi-document ACID transactions (e.g., replica set, mongos, Atlas).
 *
 * Standalone MongoDB servers will fail the trial findOne query inside a transaction,
 * allowing this function to accurately detect when multi-document transactions are unavailable.
 * Can be overridden in tests via process.env.FORCE_DISABLE_TRANSACTIONS = 'true'.
 */
async function checkTransactionSupport() {
  if (process.env.FORCE_DISABLE_TRANSACTIONS === 'true') {
    return false;
  }
  if (_supportsTransactionsCache !== null) {
    return _supportsTransactionsCache;
  }

  if (mongoose.connection.readyState !== 1) {
    return false;
  }

  try {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      // Probe with a live read to force server-side transaction evaluation
      await mongoose.connection.collection('users').findOne({}, { session });
      await session.abortTransaction();
      _supportsTransactionsCache = true;
    } catch (txErr) {
      _supportsTransactionsCache = false;
      try { await session.abortTransaction(); } catch {}
    } finally {
      await session.endSession();
    }
  } catch (sessErr) {
    _supportsTransactionsCache = false;
  }

  return _supportsTransactionsCache;
}

function resetTransactionProbeCache() {
  _supportsTransactionsCache = null;
}

// Reset transaction probe cache automatically on connection lifecycle events
if (mongoose.connection) {
  mongoose.connection.on("disconnected", () => {
    resetTransactionProbeCache();
  });
  mongoose.connection.on("reconnected", () => {
    resetTransactionProbeCache();
  });
  mongoose.connection.on("connected", () => {
    resetTransactionProbeCache();
  });
}

/**
 * Ensures unique and partial indexes are built and verified on the database.
 */
async function ensureRecoveryIndexes() {
  try {
    await Promise.all([
      WalletTransaction.init(),
      WithdrawalOperation.init()
    ]);
    return true;
  } catch (err) {
    console.error("❌ Failed to initialize recovery indexes:", err.message);
    throw err;
  }
}

/**
 * Recovers an individual interrupted withdrawal where money was refunded
 * but the ledger write was not finalized or the server crashed.
 * 
 * Uses atomic locking (recoveryLocked) to ensure safe execution under concurrent workers.
 */
async function recoverInterruptedWithdrawal(withdrawId) {
  const targetId = typeof withdrawId === 'string' ? new mongoose.Types.ObjectId(withdrawId) : withdrawId;

  // Stale lock cutoff: 5 minutes. If a previous recovery process crashed, allow resume.
  const lockCutoff = new Date(Date.now() - 5 * 60 * 1000);

  // 1. Attempt atomic recovery lock acquisition on existing WithdrawalOperation
  let op = await WithdrawalOperation.findOneAndUpdate(
    {
      withdrawId: targetId,
      $or: [
        { recoveryLocked: { $ne: true } },
        { recoveryStartedAt: { $lt: lockCutoff } }
      ]
    },
    {
      $set: {
        recoveryLocked: true,
        recoveryStartedAt: new Date()
      },
      $inc: { retryCount: 1 }
    },
    { new: true }
  );

  // If op exists and could not be locked, another worker is actively recovering it
  if (!op) {
    const existingOp = await WithdrawalOperation.findOne({ withdrawId: targetId });
    if (existingOp && existingOp.recoveryLocked && existingOp.recoveryStartedAt >= lockCutoff) {
      return {
        success: false,
        reason: 'Operation is locked by another recovery worker',
        locked: true
      };
    }
  }

  // Helper to safely unlock or record error state
  const finalizeOp = async (lastError = null, finalStatus = null) => {
    try {
      const update = { recoveryLocked: false };
      if (lastError !== null) update.lastError = lastError;
      if (finalStatus !== null) update.status = finalStatus;
      await WithdrawalOperation.updateOne({ withdrawId: targetId }, { $set: update });
    } catch (uErr) {
      console.error("Failed to unlock recovery operation:", uErr.message);
    }
  };

  try {
    // 2. Locate User and withdrawal subdocument
    const user = await User.findOne({ 'withdrawals._id': targetId });
    if (!user) {
      await finalizeOp('User containing withdrawal not found', 'failed');
      return { success: false, reason: 'User containing withdrawal not found' };
    }

    const withdrawal = user.withdrawals.id(targetId);
    if (!withdrawal) {
      await finalizeOp('Withdrawal not found on user', 'failed');
      return { success: false, reason: 'Withdrawal not found on user' };
    }

    const refundAmount = Number(withdrawal.amount) || 0;
    const reason = op?.rejectionReason || withdrawal.rejectionReason || 'Rejected by Administrator (Recovered)';

    // 3. Check if a WalletTransaction already exists for this withdrawal
    let existingTx = await WalletTransaction.findOne({
      userId: user._id,
      withdrawalId: targetId,
      category: 'refund'
    });

    if (existingTx) {
      // Ledger already exists! Finalize operation record if needed
      if (!op) {
        op = new WithdrawalOperation({
          withdrawId: targetId,
          userId: user._id,
          operationType: 'reject_refund',
          amount: refundAmount,
          rejectionReason: reason,
          walletCredited: true,
          ledgerWritten: true,
          walletTransactionId: existingTx._id,
          status: 'completed',
          recoveryLocked: false,
          completedAt: new Date(),
          strategyUsed: 'durable_state_machine'
        });
        await op.save();
      } else {
        op.status = 'completed';
        op.ledgerWritten = true;
        op.walletTransactionId = existingTx._id;
        op.recoveryLocked = false;
        op.completedAt = new Date();
        await op.save();
      }
      if (withdrawal.status !== 'rejected' || !withdrawal.refundTransactionId) {
        await User.updateOne(
          { _id: user._id, 'withdrawals._id': targetId },
          {
            $set: {
              'withdrawals.$.status': 'rejected',
              'withdrawals.$.refundTransactionId': existingTx._id,
              'withdrawals.$.refundStatus': 'completed'
            }
          }
        );
      }
      return {
        success: true,
        recovered: false,
        alreadyConsistent: true,
        transactionId: existingTx._id,
        wallet: user.wallet
      };
    }

    // 4. Missing ledger: create it WITHOUT crediting the wallet again.
    let refundTx = new WalletTransaction({
      userId: user._id,
      withdrawalId: targetId,
      amount: refundAmount,
      type: 'credit',
      category: 'refund',
      description: `Refund for rejected ${withdrawal.source === 'vip_master_card' ? 'VIP Master Card' : 'wallet'} withdrawal: ${reason}`,
      balanceAfter: user.wallet
    });

    try {
      await refundTx.save();
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        // Concurrency race: another worker saved the transaction concurrently
        existingTx = await WalletTransaction.findOne({
          userId: user._id,
          withdrawalId: targetId,
          category: 'refund'
        });
        if (existingTx) {
          refundTx = existingTx;
        }
      } else {
        throw saveErr;
      }
    }

    // 5. Update operation record
    if (!op) {
      op = new WithdrawalOperation({
        withdrawId: targetId,
        userId: user._id,
        operationType: 'reject_refund',
        amount: refundAmount,
        rejectionReason: reason,
        walletCredited: true,
        ledgerWritten: true,
        walletTransactionId: refundTx._id,
        status: 'completed',
        recoveryLocked: false,
        completedAt: new Date(),
        strategyUsed: 'durable_state_machine'
      });
    } else {
      op.ledgerWritten = true;
      op.status = 'completed';
      op.recoveryLocked = false;
      op.walletTransactionId = refundTx._id;
      op.completedAt = new Date();
    }
    await op.save();

    // 6. Update User withdrawal subdocument
    await User.updateOne(
      { _id: user._id, 'withdrawals._id': targetId },
      {
        $set: {
          'withdrawals.$.status': 'rejected',
          'withdrawals.$.rejectionReason': reason,
          'withdrawals.$.refundTransactionId': refundTx._id,
          'withdrawals.$.refundStatus': 'completed'
        }
      }
    );

    return {
      success: true,
      recovered: true,
      transactionId: refundTx._id,
      wallet: user.wallet
    };

  } catch (err) {
    console.error(`❌ Recovery error for withdrawal ${targetId}:`, err);
    await finalizeOp(err.message, 'failed');
    throw err;
  }
}

/**
 * Recovers all interrupted withdrawals across the database.
 * Scans operations with status 'initiated', 'wallet_credited', or 'failed' (under retry limit).
 */
async function recoverAllInterruptedWithdrawals() {
  const lockCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const interruptedOps = await WithdrawalOperation.find({
    status: { $in: ['initiated', 'wallet_credited', 'failed'] },
    retryCount: { $lt: 10 },
    $or: [
      { recoveryLocked: { $ne: true } },
      { recoveryStartedAt: { $lt: lockCutoff } }
    ]
  });

  const results = [];
  for (const op of interruptedOps) {
    try {
      console.log(`[WithdrawalRecovery] Attempting recovery for withdrawal ${op.withdrawId} (status=${op.status}, retries=${op.retryCount})...`);
      const res = await recoverInterruptedWithdrawal(op.withdrawId);
      results.push({ withdrawId: op.withdrawId, ...res });
    } catch (err) {
      console.error(`[WithdrawalRecovery] Error recovering ${op.withdrawId}:`, err.message);
      results.push({ withdrawId: op.withdrawId, success: false, error: err.message });
    }
  }

  return results;
}

let _recoveryInitialized = false;

/**
 * Startup initialization function: ensures indexes and runs background sweep.
 */
async function initializeWithdrawalRecovery() {
  if (_recoveryInitialized) return;
  _recoveryInitialized = true;

  try {
    await ensureRecoveryIndexes();
    console.log("🔄 Running startup withdrawal recovery sweep...");
    const results = await recoverAllInterruptedWithdrawals();
    const recoveredCount = results.filter(r => r.recovered).length;
    console.log(`✅ Startup withdrawal recovery completed: ${results.length} scanned, ${recoveredCount} recovered`);
    return results;
  } catch (err) {
    console.error("❌ Startup withdrawal recovery failed:", err);
  }
}

/**
 * Complete Hardened Rejection Execution
 */
async function executeHardenedRejection({ userId, withdrawId, reason, adminEmail }) {
  const targetWithdrawId = typeof withdrawId === 'string' ? new mongoose.Types.ObjectId(withdrawId) : withdrawId;
  const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

  // 1. Fetch user and withdrawal
  const user = await User.findById(userObjectId);
  if (!user) {
    return { status: 404, data: { error: "User not found" } };
  }

  const withdrawal = user.withdrawals.id(targetWithdrawId);
  if (!withdrawal) {
    return { status: 404, data: { error: "Withdrawal not found" } };
  }

  const refundAmount = Number(withdrawal.amount) || 0;
  const rejectionReason = reason || "Rejected by Administrator";
  const now = new Date();

  // 2. Check for completed or interrupted WithdrawalOperation
  let op = await WithdrawalOperation.findOne({ withdrawId: targetWithdrawId });

  // If already completed and ledger exists, preserve existing API contract: return 400
  if (withdrawal.status === 'rejected') {
    const existingTx = await WalletTransaction.findOne({
      userId: userObjectId,
      withdrawalId: targetWithdrawId,
      category: 'refund'
    });
    if (existingTx) {
      return {
        status: 400,
        data: {
          error: `Withdrawal cannot be rejected because it is currently '${withdrawal.status}'`,
          alreadyCompleted: true
        }
      };
    }
    // Missing ledger: recover it
    const recoveryRes = await recoverInterruptedWithdrawal(targetWithdrawId);
    if (recoveryRes.success) {
      return {
        status: 200,
        data: {
          message: "Withdrawal rejected & refunded",
          reason: rejectionReason,
          remainingBalance: recoveryRes.wallet,
          recovered: true
        }
      };
    } else {
      return {
        status: 400,
        data: {
          error: `Withdrawal cannot be rejected because it is currently '${withdrawal.status}'`,
          inProgress: recoveryRes.locked || false
        }
      };
    }
  }

  if (op && op.status === 'completed') {
    return {
      status: 400,
      data: {
        error: `Withdrawal cannot be rejected because it is currently '${withdrawal.status}'`,
        alreadyCompleted: true
      }
    };
  }

  if (op && op.status === 'wallet_credited') {
    const recoveryRes = await recoverInterruptedWithdrawal(targetWithdrawId);
    if (recoveryRes.success) {
      return {
        status: 200,
        data: {
          message: "Withdrawal rejected & refunded",
          reason: rejectionReason,
          remainingBalance: recoveryRes.wallet,
          recovered: true
        }
      };
    } else {
      return {
        status: 400,
        data: {
          error: `Withdrawal cannot be rejected because it is currently '${withdrawal.status}'`,
          inProgress: recoveryRes.locked || false
        }
      };
    }
  }

  // 3. Normal rejection validation
  if (withdrawal.status !== "pending") {
    return {
      status: 400,
      data: {
        error: `Withdrawal cannot be rejected because it is currently '${withdrawal.status}'`
      }
    };
  }

  // 4. Determine strategy: Multi-Document Transaction vs. Durable State Machine
  let supportsTx = await checkTransactionSupport();

  if (supportsTx) {
    // =========================================================================
    // STRATEGY A: NATIVE MULTI-DOCUMENT ACID TRANSACTION
    // =========================================================================
    const session = await mongoose.startSession();
    try {
      let updatedUser = null;
      let refundTx = null;

      await session.withTransaction(async () => {
        // Atomic conditional lock and update on User document
        updatedUser = await User.findOneAndUpdate(
          {
            _id: userObjectId,
            withdrawals: {
              $elemMatch: {
                _id: targetWithdrawId,
                status: "pending"
              }
            }
          },
          {
            $inc: { wallet: refundAmount },
            $set: {
              "withdrawals.$.status": "rejected",
              "withdrawals.$.rejectionReason": rejectionReason,
              "withdrawals.$.rejectedAt": now,
              "withdrawals.$.refundStatus": "completed"
            }
          },
          { new: true, session }
        );

        if (!updatedUser) {
          throw new Error("CONCURRENT_CONFLICT");
        }

        // Ledger insert inside the same transaction
        refundTx = new WalletTransaction({
          userId: updatedUser._id,
          withdrawalId: targetWithdrawId,
          amount: refundAmount,
          type: 'credit',
          category: 'refund',
          description: `Refund for rejected ${withdrawal.source === 'vip_master_card' ? 'VIP Master Card' : 'wallet'} withdrawal: ${rejectionReason}`,
          balanceAfter: updatedUser.wallet
        });

        await refundTx.save({ session });

        // Update withdrawal subdocument with transaction ID
        await User.updateOne(
          { _id: userObjectId, "withdrawals._id": targetWithdrawId },
          { $set: { "withdrawals.$.refundTransactionId": refundTx._id } },
          { session }
        );

        // Record operation log inside transaction
        await WithdrawalOperation.updateOne(
          { withdrawId: targetWithdrawId },
          {
            $set: {
              userId: userObjectId,
              operationType: 'reject_refund',
              amount: refundAmount,
              status: 'completed',
              rejectionReason,
              walletCredited: true,
              ledgerWritten: true,
              walletTransactionId: refundTx._id,
              strategyUsed: 'transaction',
              completedAt: now
            }
          },
          { session, upsert: true }
        );
      });

      // Transaction committed atomically!
      sendMail(
        user.email,
        "Withdrawal Rejected",
        `
        <h2>Hello ${user.name},</h2>
        <p>Your withdrawal request of <b>₹${refundAmount}</b> was rejected.</p>
        <p><strong>Reason:</strong> ${rejectionReason}</p>
        <p>The amount of <b>₹${refundAmount}</b> has been refunded to your wallet.</p>
        <br>
        <p>Shree Mata Team</p>
        `
      ).catch(() => {});

      return {
        status: 200,
        data: {
          message: "Withdrawal rejected & refunded",
          reason: rejectionReason,
          remainingBalance: updatedUser.wallet,
          strategy: 'transaction'
        }
      };

    } catch (err) {
      if (err.message === "CONCURRENT_CONFLICT") {
        const refreshed = await User.findById(userObjectId);
        const refW = refreshed ? refreshed.withdrawals.id(targetWithdrawId) : null;
        return {
          status: 409,
          data: {
            error: `Withdrawal could not be rejected. It is currently '${refW ? refW.status : "unknown"}'`
          }
        };
      }
      
      // If transactions are not supported on this deployment (e.g. standalone mongod)
      if (err.message && err.message.includes("Transaction numbers are only allowed")) {
        _supportsTransactionsCache = false;
        // Fallback to Strategy B below
      } else {
        console.error("Transaction reject error:", err);
        return { status: 500, data: { error: err.message || "Transaction failure" } };
      }
    } finally {
      await session.endSession();
    }
  }

  // =========================================================================
  // STRATEGY B: DURABLE TWO-PHASE STATE MACHINE WITH COMPENSATING ROLLBACK
  // =========================================================================

  // Phase 1: Create or update operation record
  if (!op) {
    op = await WithdrawalOperation.findOneAndUpdate(
      { withdrawId: targetWithdrawId },
      {
        $setOnInsert: {
          withdrawId: targetWithdrawId,
          userId: userObjectId,
          operationType: 'reject_refund',
          amount: refundAmount,
          rejectionReason,
          strategyUsed: 'durable_state_machine'
        },
        $set: { status: 'initiated' }
      },
      { upsert: true, new: true }
    );
  }

  // Phase 2: Atomic update to User wallet & withdrawal status
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: userObjectId,
      withdrawals: {
        $elemMatch: {
          _id: targetWithdrawId,
          status: "pending"
        }
      }
    },
    {
      $inc: { wallet: refundAmount },
      $set: {
        "withdrawals.$.status": "rejected",
        "withdrawals.$.rejectionReason": rejectionReason,
        "withdrawals.$.rejectedAt": now,
        "withdrawals.$.refundStatus": "pending"
      }
    },
    { new: true }
  );

  if (!updatedUser) {
    const refreshed = await User.findById(userObjectId);
    const refW = refreshed ? refreshed.withdrawals.id(targetWithdrawId) : null;
    return {
      status: 409,
      data: {
        error: `Withdrawal could not be rejected. It is currently '${refW ? refW.status : "unknown"}'`
      }
    };
  }

  // Mark op wallet_credited
  op.walletCredited = true;
  op.status = 'wallet_credited';
  await op.save();

  // Phase 3: Create & save WalletTransaction
  let refundTx = new WalletTransaction({
    userId: updatedUser._id,
    withdrawalId: targetWithdrawId,
    amount: refundAmount,
    type: 'credit',
    category: 'refund',
    description: `Refund for rejected ${withdrawal.source === 'vip_master_card' ? 'VIP Master Card' : 'wallet'} withdrawal: ${rejectionReason}`,
    balanceAfter: updatedUser.wallet
  });

  try {
    try {
      await refundTx.save();
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        // Concurrently saved by another request
        const existingTx = await WalletTransaction.findOne({
          userId: userObjectId,
          withdrawalId: targetWithdrawId,
          category: 'refund'
        });
        if (existingTx) {
          refundTx = existingTx;
        }
      } else {
        throw saveErr;
      }
    }

    // Finalize operation
    op.ledgerWritten = true;
    op.status = 'completed';
    op.walletTransactionId = refundTx._id;
    op.completedAt = new Date();
    await op.save();

    await User.updateOne(
      { _id: userObjectId, "withdrawals._id": targetWithdrawId },
      {
        $set: {
          "withdrawals.$.refundTransactionId": refundTx._id,
          "withdrawals.$.refundStatus": "completed"
        }
      }
    );

    sendMail(
      user.email,
      "Withdrawal Rejected",
      `
      <h2>Hello ${user.name},</h2>
      <p>Your withdrawal request of <b>₹${refundAmount}</b> was rejected.</p>
      <p><strong>Reason:</strong> ${rejectionReason}</p>
      <p>The amount of <b>₹${refundAmount}</b> has been refunded to your wallet.</p>
      <br>
      <p>Shree Mata Team</p>
      `
    ).catch(() => {});

    return {
      status: 200,
      data: {
        message: "Withdrawal rejected & refunded",
        reason: rejectionReason,
        remainingBalance: updatedUser.wallet,
        strategy: 'durable_state_machine'
      }
    };

  } catch (txErr) {
    console.error("CRITICAL: Failed to save WalletTransaction refund ledger entry:", txErr);
    op.lastError = txErr.message;
    await op.save();

    // Attempt compensating rollback
    try {
      await User.findOneAndUpdate(
        { _id: userObjectId, "withdrawals._id": targetWithdrawId },
        {
          $inc: { wallet: -refundAmount },
          $set: {
            "withdrawals.$.status": "pending",
            "withdrawals.$.rejectionReason": null,
            "withdrawals.$.rejectedAt": null,
            "withdrawals.$.refundStatus": "none"
          }
        }
      );
      op.walletCredited = false;
      op.status = 'failed';
      await op.save();
      return {
        status: 500,
        data: { error: "Failed to record wallet transaction. Rejection rolled back." }
      };
    } catch (rbErr) {
      console.error("EMERGENCY: Compensating rollback also failed:", rbErr);
      // The op record remains with status='wallet_credited' so recovery can safely resume!
      return {
        status: 500,
        data: { error: "Database error during rollback. Interrupted state recorded for recovery." }
      };
    }
  }
}

module.exports = {
  checkTransactionSupport,
  resetTransactionProbeCache,
  executeHardenedRejection,
  recoverInterruptedWithdrawal,
  recoverAllInterruptedWithdrawals,
  ensureRecoveryIndexes,
  initializeWithdrawalRecovery
};
