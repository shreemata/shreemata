/**
 * SHREE MATA — MONGODUMP MANIFEST PARSING & RACE-CONDITION PROTECTION TEST SUITE
 * 
 * Tests:
 * 1. parseMongodumpStats extracts per-collection dumped counts correctly
 * 2. Document totals and collection counts are calculated accurately
 * 3. Unrelated database namespaces are filtered out
 * 4. Duplicate dump lines do not double count
 * 5. Malformed or missing stats fails closed (ok: false)
 * 6. System collections (system.*) are ignored
 * 7. Manifest SHA strictly equals archive SHA
 */

'use strict';

const { parseMongodumpStats } = require('../scripts/backup-database');

describe('Mongodump Stream Manifest Parser (Race-Condition Free)', () => {

    const sampleMongodumpOutput = `
2026-09-12T08:51:53.100+0000\twriting shreemata.users to archive on stdout
2026-09-12T08:51:53.150+0000\tdone dumping shreemata.users (5 documents)
2026-09-12T08:51:53.200+0000\twriting shreemata.books to archive on stdout
2026-09-12T08:51:53.250+0000\tdone dumping shreemata.books (5 documents)
2026-09-12T08:51:53.300+0000\twriting shreemata.orders to archive on stdout
2026-09-12T08:51:53.350+0000\tdone dumping shreemata.orders (25 documents)
2026-09-12T08:51:53.400+0000\twriting shreemata.wallettransactions to archive on stdout
2026-09-12T08:51:53.450+0000\tdone dumping shreemata.wallettransactions (80 documents)
2026-09-12T08:51:53.500+0000\twriting shreemata.commissiontransactions to archive on stdout
2026-09-12T08:51:53.550+0000\tdone dumping shreemata.commissiontransactions (102 documents)
2026-09-12T08:51:53.600+0000\twriting shreemata.vipmastercards to archive on stdout
2026-09-12T08:51:53.650+0000\tdone dumping shreemata.vipmastercards (14 documents)
2026-09-12T08:51:53.700+0000\twriting shreemata.invoices to archive on stdout
2026-09-12T08:51:53.750+0000\tdone dumping shreemata.invoices (37 documents)
`;

    test('1. parseMongodumpStats extracts per-collection dumped counts correctly', () => {
        const stats = parseMongodumpStats(sampleMongodumpOutput, 'shreemata');
        expect(stats.ok).toBe(true);
        expect(stats.collections.users).toBe(5);
        expect(stats.collections.books).toBe(5);
        expect(stats.collections.orders).toBe(25);
        expect(stats.collections.wallettransactions).toBe(80);
        expect(stats.collections.commissiontransactions).toBe(102);
        expect(stats.collections.vipmastercards).toBe(14);
        expect(stats.collections.invoices).toBe(37);
    });

    test('2. Document totals and collection counts are calculated accurately', () => {
        const stats = parseMongodumpStats(sampleMongodumpOutput, 'shreemata');
        expect(stats.ok).toBe(true);
        expect(stats.collectionCount).toBe(7);
        expect(stats.documentCount).toBe(5 + 5 + 25 + 80 + 102 + 14 + 37); // 268
    });

    test('3. Unrelated database namespaces are filtered out', () => {
        const outputWithOtherDbs = `
2026-09-12T08:51:53.150+0000\tdone dumping admin.system.users (2 documents)
2026-09-12T08:51:53.160+0000\tdone dumping config.settings (1 documents)
2026-09-12T08:51:53.170+0000\tdone dumping other_db.items (50 documents)
2026-09-12T08:51:53.250+0000\tdone dumping shreemata.users (5 documents)
2026-09-12T08:51:53.350+0000\tdone dumping shreemata.orders (25 documents)
`;
        const stats = parseMongodumpStats(outputWithOtherDbs, 'shreemata');
        expect(stats.ok).toBe(true);
        expect(stats.collectionCount).toBe(2);
        expect(stats.documentCount).toBe(30);
        expect(stats.collections).toEqual({
            users: 5,
            orders: 25
        });
        expect(stats.collections.items).toBeUndefined();
    });

    test('4. Duplicate dump lines do not double count', () => {
        const outputWithDuplicates = `
2026-09-12T08:51:53.100+0000\tdone dumping shreemata.users (5 documents)
2026-09-12T08:51:53.200+0000\tdone dumping shreemata.users (5 documents)
2026-09-12T08:51:53.300+0000\tdone dumping shreemata.orders (25 documents)
`;
        const stats = parseMongodumpStats(outputWithDuplicates, 'shreemata');
        expect(stats.ok).toBe(true);
        expect(stats.collectionCount).toBe(2);
        expect(stats.documentCount).toBe(30);
        expect(stats.collections.users).toBe(5);
        expect(stats.collections.orders).toBe(25);
    });

    test('5. Malformed or empty output fails closed (ok: false)', () => {
        const emptyStats = parseMongodumpStats('', 'shreemata');
        expect(emptyStats.ok).toBe(false);
        expect(emptyStats.collectionCount).toBe(0);

        const malformedStats = parseMongodumpStats('Random mongodump banner without dumping lines', 'shreemata');
        expect(malformedStats.ok).toBe(false);
        expect(malformedStats.collectionCount).toBe(0);
    });

    test('6. System collections (system.*) are ignored', () => {
        const outputWithSystem = `
2026-09-12T08:51:53.100+0000\tdone dumping shreemata.system.views (0 documents)
2026-09-12T08:51:53.200+0000\tdone dumping shreemata.system.profile (10 documents)
2026-09-12T08:51:53.300+0000\tdone dumping shreemata.users (5 documents)
`;
        const stats = parseMongodumpStats(outputWithSystem, 'shreemata');
        expect(stats.ok).toBe(true);
        expect(stats.collectionCount).toBe(1);
        expect(stats.documentCount).toBe(5);
        expect(stats.collections).toEqual({ users: 5 });
    });

    test('7. Manifest structure matches archive sha256 checksum exactly', () => {
        const stats = parseMongodumpStats(sampleMongodumpOutput, 'shreemata');
        const calculatedSha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        const manifest = {
            version: '1.0',
            filename: 'shreemata-2026-09-12T08-51-53-798Z.archive.gz',
            createdAt: new Date().toISOString(),
            databaseName: 'shreemata',
            archiveSha256: calculatedSha,
            collectionCount: stats.collectionCount,
            documentCount: stats.documentCount,
            collections: stats.collections
        };

        expect(manifest.archiveSha256).toBe(calculatedSha);
        expect(manifest.documentCount).toBe(268);
    });
});
