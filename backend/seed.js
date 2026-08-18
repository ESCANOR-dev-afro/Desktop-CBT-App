/**
 * seed.js
 * 
 * Standalone Database Migration & Re-Seeding Script for Desktop CBT App.
 * Cleans out old numeric registration numbers (e.g. '1009003') and seeds 50 realistic
 * candidate records using the standardized AWA2627XXXX dual-year format for session 2026/2027.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'cbt_database.db');
const db = new sqlite3.Database(DB_PATH);

function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function reseedDatabase() {
    console.log('----------------------------------------------------');
    console.log('🔄 RE-SEEDING CBT DATABASE WITH NEW AWA2627XXXX REG NO STANDARD');
    console.log('----------------------------------------------------');

    try {
        // 1. Ensure academic term 2026/2027 1st Term is set to active (is_current = 1)
        await runAsync(`UPDATE academic_terms SET is_current = 0`);
        await runAsync(
            `INSERT INTO academic_terms (name, session, is_current) VALUES ('1st Term', '2026/2027', 1)
             ON CONFLICT(name, session) DO UPDATE SET is_current = 1`
        );
        const activeTerm = await new Promise((res) => db.get(`SELECT id FROM academic_terms WHERE is_current = 1`, (e, r) => res(r)));
        const termId = activeTerm ? activeTerm.id : 1;

        // 2. Clean out old candidates with numeric IDs or invalid reg formats
        await runAsync(`DELETE FROM students WHERE reg_number NOT LIKE 'AWA2627%' AND registration_no NOT LIKE 'AWA2627%'`);
        console.log('🧹 Purged legacy numeric registration records (e.g. 1009003).');

        // 3. Define 50 realistic candidate records spanning all class tiers & streams
        const candidatesToSeed = [
            // JSS 1 Arms
            { surname: 'OKONKWO', first_name: 'Chidi', class: 'JSS 1 Gold' },
            { surname: 'ADEBAYO', first_name: 'Amina', class: 'JSS 1 Gold' },
            { surname: 'EZE', first_name: 'Grace', class: 'JSS 1 Silver' },
            { surname: 'KALU', first_name: 'David', class: 'JSS 1 Silver' },
            { surname: 'OKON', first_name: 'Blessing', class: 'JSS 1 Diamond' },
            { surname: 'KANU', first_name: 'Nnamdi', class: 'JSS 1 Diamond' },

            // JSS 2 Arms
            { surname: 'BELLO', first_name: 'Zainab', class: 'JSS 2 Gold' },
            { surname: 'LAWAL', first_name: 'Farouk', class: 'JSS 2 Gold' },
            { surname: 'AJAYI', first_name: 'Oluwaseun', class: 'JSS 2 Silver' },
            { surname: 'SANUSI', first_name: 'Kemi', class: 'JSS 2 Silver' },
            { surname: 'OBASI', first_name: 'Emeka', class: 'JSS 2 Diamond' },
            { surname: 'BAKARE', first_name: 'Tayo', class: 'JSS 2 Diamond' },

            // JSS 3 Arms
            { surname: 'DANIELS', first_name: 'Joy', class: 'JSS 3 Gold' },
            { surname: 'AHMED', first_name: 'Mustapha', class: 'JSS 3 Gold' },
            { surname: 'WILLIAMS', first_name: 'Grace', class: 'JSS 3 Silver' },
            { surname: 'NWACHUKWU', first_name: 'Sandra', class: 'JSS 3 Silver' },
            { surname: 'IBRAHIM', first_name: 'Halima', class: 'JSS 3 Diamond' },
            { surname: 'ALABI', first_name: 'Gideon', class: 'JSS 3 Diamond' },

            // SS 1 Streams
            { surname: 'PATRICK', first_name: 'Emmanuel', class: 'SS 1 Science' },
            { surname: 'CHUKWU', first_name: 'Miracle', class: 'SS 1 Science' },
            { surname: 'OGUNLEYE', first_name: 'Ayodeji', class: 'SS 1 Art' },
            { surname: 'YUSUFU', first_name: 'Bilikisu', class: 'SS 1 Art' },
            { surname: 'ONAH', first_name: 'Paul', class: 'SS 1 Commercial' },
            { surname: 'IGWE', first_name: 'Chiamaka', class: 'SS 1 Commercial' },

            // SS 2 Streams
            { surname: 'USMAN', first_name: 'Babatunde', class: 'SS 2 Science' },
            { surname: 'ABUBAKAR', first_name: 'Sadiq', class: 'SS 2 Science' },
            { surname: 'FOLORUNSHO', first_name: 'Babatunde', class: 'SS 2 Art' },
            { surname: 'NWOSU', first_name: 'Kafayat', class: 'SS 2 Art' },
            { surname: 'ADEYEMI', first_name: 'Oluwaseun', class: 'SS 2 Commercial' },
            { surname: 'OKAFOR', first_name: 'Chiamaka', class: 'SS 2 Commercial' },

            // SS 3 Streams
            { surname: 'EZE', first_name: 'Stephanie', class: 'SS 3 Science' },
            { surname: 'DANJUMA', first_name: 'Ibrahim', class: 'SS 3 Science' },
            { surname: 'BALOGUN', first_name: 'Tunde', class: 'SS 3 Science' },
            { surname: 'FAYE', first_name: 'Fatou', class: 'SS 3 Art' },
            { surname: 'MOMOH', first_name: 'Yakubu', class: 'SS 3 Art' },
            { surname: 'SULIAMAN', first_name: 'Hassan', class: 'SS 3 Commercial' },
            { surname: 'GARBA', first_name: 'Usman', class: 'SS 3 Commercial' },

            // Additional Candidates to reach 50 records
            { surname: 'SHITTA', first_name: 'Mariam', class: 'SS 1 Science' },
            { surname: 'KAYODE', first_name: 'Femi', class: 'SS 1 Science' },
            { surname: 'OJO', first_name: 'Bukola', class: 'SS 2 Science' },
            { surname: 'ADELEKE', first_name: 'Adewale', class: 'SS 2 Art' },
            { surname: 'CHIMA', first_name: 'Kingsley', class: 'SS 2 Commercial' },
            { surname: 'ADEDOKUN', first_name: 'Lateef', class: 'SS 3 Science' },
            { surname: 'BAMGBOSE', first_name: 'Tobi', class: 'SS 3 Art' },
            { surname: 'DISU', first_name: 'Rasheed', class: 'SS 3 Commercial' },
            { surname: 'MACINTOSH', first_name: 'Sarah', class: 'JSS 1 Gold' },
            { surname: 'IDRIS', first_name: 'Kabiru', class: 'JSS 2 Gold' },
            { surname: 'ODUWOLE', first_name: 'Segun', class: 'JSS 3 Gold' },
            { surname: 'UDOFIA', first_name: 'Anietie', class: 'SS 1 Science' },
            { surname: 'JOLAOSHO', first_name: 'Abayomi', class: 'SS 2 Art' },
            { surname: 'EKEH', first_name: 'Obinna', class: 'SS 3 Commercial' }
        ];

        // 4. Insert candidate records with sequential IDs AWA26270001 to AWA26270050
        for (let i = 0; i < candidatesToSeed.length; i++) {
            const cand = candidatesToSeed[i];
            const serialNumber = String(i + 1).padStart(4, '0');
            const regNo = `AWA2627${serialNumber}`;
            const hashedPassword = crypto.createHash('sha256').update(cand.surname).digest('hex');

            // Allocate stream subjects
            let assignedSubj = "Mathematics, English Language, Basic Science";
            const clsUpper = cand.class.toUpperCase();
            if (clsUpper.startsWith('JSS')) {
                assignedSubj = "English Language, Mathematics, Yoruba, French, Fine Art, Music, Basic Science, Basic Technology, PHE, Digital Technology, Social Studies, Civic Education, Home Economics, Agricultural Science, Business Studies, History";
            } else if (clsUpper.includes('SCIENCE')) {
                assignedSubj = "Mathematics, English Language, Biology, Chemistry, Physics, Civic Education, Further Mathematics, Economics, Digital Technology, Geography, Agricultural Science";
            } else if (clsUpper.includes('COMMERCIAL')) {
                assignedSubj = "Mathematics, English Language, Civic Education, Further Mathematics, Economics, Digital Technology, Account, Commerce";
            } else if (clsUpper.includes('ART')) {
                assignedSubj = "Mathematics, English Language, Civic Education, Economics, Digital Technology, Government, CRS, Literature in English";
            }

            // Resolve class_id
            let classRow = await new Promise((res) => db.get(`SELECT id FROM classes WHERE LOWER(name) = LOWER(?)`, [cand.class], (e, r) => res(r)));
            if (!classRow) {
                const level = clsUpper.startsWith('JSS') ? 'JSS' : 'SS';
                await runAsync(`INSERT OR IGNORE INTO classes (name, level) VALUES (?, ?)`, [cand.class, level]);
                classRow = await new Promise((res) => db.get(`SELECT id FROM classes WHERE LOWER(name) = LOWER(?)`, [cand.class], (e, r) => res(r)));
            }

            const sql = `
                INSERT INTO students (reg_number, registration_no, surname, first_name, class, assigned_subject, class_id, academic_term_id, password)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(reg_number) DO UPDATE SET
                    registration_no = excluded.registration_no,
                    surname = excluded.surname,
                    first_name = excluded.first_name,
                    class = excluded.class,
                    class_id = excluded.class_id,
                    academic_term_id = excluded.academic_term_id,
                    password = excluded.password
            `;

            await runAsync(sql, [
                regNo,
                regNo,
                cand.surname,
                cand.first_name,
                cand.class,
                assignedSubj,
                classRow ? classRow.id : null,
                termId,
                hashedPassword
            ]);
        }

        console.log(`✅ Successfully seeded ${candidatesToSeed.length} candidates (AWA26270001 - AWA26270050) into SQLite database.`);
        console.log('----------------------------------------------------');
        db.close();
        process.exit(0);

    } catch (err) {
        console.error('❌ Re-seed failed:', err);
        db.close();
        process.exit(1);
    }
}

reseedDatabase();
