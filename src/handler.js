const { nanoid } = require('nanoid');
const connection = require('./db');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { uploadImageHandler } = require('./ImageUpload');  

// Fungsi untuk memeriksa koneksi ke database
const checkDatabaseConnection = async () => {
    try {
        await connection.promise().query('SELECT 1');
    } catch (err) {
        console.error('Koneksi ke database terputus:', err.message);
        throw new Error('Koneksi ke database gagal.');
    }
};

const getPlantData = async (request, h) => {
    const { id_tanaman } = request.params;  // Ambil id_tanaman dari parameter path

    try {
        await checkDatabaseConnection();

        const query = 'SELECT nama_tanaman, desc_tanaman FROM tanaman WHERE id_tanaman = ?';
        const [results] = await connection.promise().query(query, [id_tanaman]);

        if (results.length === 0) {
            return h.response({ message: 'Plant not found.' }).code(404);
        }

        return h.response(results[0]).code(200);
    } catch (error) {
        console.error(error);
        return h.response({ message: 'Failed to fetch plant data.' }).code(500);
    }
};

const getDiseaseSolutions = async (request, h) => {
    try {
        await checkDatabaseConnection();

        const query = `
            SELECT tanaman.nama_tanaman AS plant_name, penyakit.nama_penyakit AS disease_name, solusi.desc_solusi AS solution
            FROM tanaman
            JOIN penyakit ON tanaman.id_tanaman = penyakit.id_tanaman
            JOIN solusi ON penyakit.id_penyakit = solusi.id_penyakit
        `;

        const [results] = await connection.promise().query(query);
        return h.response(results).code(200);
    } catch (error) {
        console.error(error);
        return h.response({ message: 'Failed to fetch disease solutions.' }).code(500);
    }
};

const predictImageWithPython = (imagePath) => {
    return new Promise((resolve, reject) => {
        const command = `python3 ./src/predict.py "${imagePath}"`;
        console.log(`Menjalankan perintah Python: ${command}`);
        exec(command, (err, stdout, stderr) => {
            if (err) {
                console.error(`Error saat menjalankan skrip Python: ${stderr}`);
                return reject(stderr);
            }

            console.log(`Output dari Python: ${stdout}`);

            const cleanedOutput = stdout
                .replace(/\x1b\[[0-9;]*m/g, '') 
                .replace(/\b/g, '')             
                .trim();                        

            const prediction = cleanedOutput.split('\n').pop().trim();
            console.log(`Prediksi hasil: ${prediction}`);

            resolve(prediction);
        });
    });
};

const uploadImageAndPredictHandler = async (request, h) => {
    const { file } = request.payload;

    if (!file || !file.hapi.filename) {
        return h.response({
            status: 'fail',
            message: 'Gagal mengunggah gambar. Mohon lampirkan file gambar.',
        }).code(400);
    }

    const fileName = file.hapi.filename;
    const uploadPath = path.join(__dirname, 'uploads', fileName);

    try {
        await checkDatabaseConnection();

        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const fileStream = fs.createWriteStream(uploadPath);
        await new Promise((resolve, reject) => {
            file.pipe(fileStream);
            file.on('end', resolve);
            file.on('error', (err) => reject(err));
        });

        const prediction = await predictImageWithPython(uploadPath);
        const publicUrl = await uploadImageHandler(uploadPath, fileName);
        console.log(`Gambar berhasil diupload ke GCS: ${publicUrl}`);

        const [nama_tanaman, nama_penyakit] = prediction.split('___');
        console.log(`Prediksi tanaman: ${nama_tanaman}, penyakit: ${nama_penyakit}`);

        const getIdTanamanQuery = 'SELECT id_tanaman FROM tanaman WHERE nama_tanaman = ?';
        const [tanamanResult] = await connection.promise().query(getIdTanamanQuery, [nama_tanaman]);

        if (tanamanResult.length === 0) throw new Error(`Tanaman "${nama_tanaman}" tidak ditemukan.`);
        const id_tanaman = tanamanResult[0].id_tanaman;

        const getIdPenyakitQuery = 'SELECT id_penyakit FROM penyakit WHERE nama_penyakit = ? AND id_tanaman = ?';
        const [penyakitResult] = await connection.promise().query(getIdPenyakitQuery, [nama_penyakit, id_tanaman]);

        if (penyakitResult.length === 0) throw new Error(`Penyakit "${nama_penyakit}" untuk tanaman "${nama_tanaman}" tidak ditemukan.`);
        const id_penyakit = penyakitResult[0].id_penyakit;
        console.log("penyakit berhasil diidentifikasi");

        const getDescSolusiQuery = 'SELECT desc_solusi, id_solusi FROM solusi WHERE id_penyakit = ?';
        const [solusiResult] = await connection.promise().query(getDescSolusiQuery, [id_penyakit]);

        if (solusiResult.length === 0) throw new Error(`Solusi untuk penyakit "${nama_penyakit}" tidak ditemukan.`);
        const desc_solusi = solusiResult[0].desc_solusi;
        const id_solusi = solusiResult[0].id_solusi;
        console.log("solusi berhasil diidentifikasi");

        const insertQuery = `
        INSERT INTO history (id_history, tgl_history, id_tanaman, id_penyakit, id_solusi, image)
        VALUES (?, ?, ?, ?, ?, ?)`;
        console.log("history berhasil diidentifikasi");

        const historyId = nanoid();
        const tgl_history = new Date().toISOString().split('T')[0];
        await connection.promise().query(insertQuery, [historyId, tgl_history, id_tanaman, id_penyakit, id_solusi, publicUrl]);

        fs.unlinkSync(uploadPath);
        console.log(`File gambar ${uploadPath} telah dihapus setelah diproses.`);

        return h.response({
            status: 'success',
            message: 'Gambar berhasil diprediksi dan diupload.',
            data: {
                nama_tanaman,
                nama_penyakit,
                penanganan: desc_solusi,
            },
        }).code(200);

    } catch (error) {
        console.error(`Terjadi kesalahan: ${error.message}`);

        if (fs.existsSync(uploadPath)) {
            fs.unlinkSync(uploadPath);
            console.log(`File ${uploadPath} telah dihapus setelah error.`);
        }

        return h.response({
            status: 'fail',
            message: 'Gagal memproses gambar.',
            error: error.message
        }).code(500);
    }
};

const getHistoryHandler = async (request, h) => {
    const query = `
    SELECT 
        h.id_history,
        t.nama_tanaman, 
        p.nama_penyakit, 
        s.desc_solusi,  
        h.image,
        h.tgl_history
    FROM 
        history h
    JOIN 
        tanaman t ON h.id_tanaman = t.id_tanaman
    JOIN 
        penyakit p ON h.id_penyakit = p.id_penyakit
    JOIN 
        solusi s ON h.id_solusi = s.id_solusi  
    ORDER BY 
        h.tgl_history DESC;
    `;

    try {
        await checkDatabaseConnection();

        const [rows] = await connection.promise().query(query);
        console.log(rows);

        rows.forEach(row => {
            const date = new Date(row.tgl_history);
            row.tgl_history = date.toLocaleDateString('id-ID'); 
        });

        return h.response({
            status: 'success',
            data: rows,
        }).code(200);
    } catch (error) {
        console.error(error);
        return h.response({
            status: 'fail',
            message: 'Gagal mengambil data history.',
        }).code(500);
    }
};

module.exports = { getPlantData, getDiseaseSolutions, getHistoryHandler, uploadImageAndPredictHandler };