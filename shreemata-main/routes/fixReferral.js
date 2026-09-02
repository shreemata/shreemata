router.get("/fix", async (req, res) => {
    const users = await User.find({ referralCode: { $exists: false } });

    users.forEach(async (u) => {
        u.referralCode = "REF" + Math.floor(100000 + Math.random() * 900000);
        await u.save();
    });

    res.send("Referral codes generated for older users.");
});
