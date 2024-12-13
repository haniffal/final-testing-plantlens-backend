'use strict'
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');

const pathKey = path.resolve('/mnt/c/Users/HANIF/plantlens-cloudshell/upload/serviceaccountkey1.json');
const gcs = new Storage({
    projectId: 'testing-plantlens',
    keyFilename: pathKey
});

const bucketName = 'history-image1';
const bucket = gcs.bucket(bucketName);

function getPublicUrl(filename) {
    return `https://storage.googleapis.com/${bucketName}/${filename}`;
}

const uploadImageHandler = async (filePath, fileName) => {
    if (!fs.existsSync(filePath)) {
        console.error(`File tidak ditemukan: ${filePath}`);
        throw new Error('Gagal mengunggah gambar. File tidak ditemukan.');
    }

    // Ekstensi file yang diizinkan
    const allowedExtensions = ['jpeg', 'jpg', 'png'];
    const fileExtension = path.extname(fileName).toLowerCase().slice(1); 

    if (!allowedExtensions.includes(fileExtension)) {
        console.error(`Format file tidak didukung: ${fileExtension}`);
        throw new Error('Format file tidak didukung. Hanya mendukung JPEG, JPG, dan PNG.');
    }

    const gcsname = `${Date.now()}-${fileName}`;
    const fileUpload = bucket.file(gcsname);

    try {
        // Buat stream untuk mengunggah file ke GCS
        const stream = fileUpload.createWriteStream({
            metadata: {
                contentType: `image/${fileExtension}`,
            },
        });

        console.log(`Mengunggah file ${filePath} ke GCS...`);
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(stream)
                .on('finish', resolve)
                .on('error', reject);
        });

        console.log(`File berhasil diupload ke GCS: ${gcsname}`);
        return getPublicUrl(gcsname);
    } catch (error) {
        console.error(`Gagal mengunggah gambar ke GCS: ${error.message}`);
        throw new Error('Gagal mengunggah gambar. Terjadi kesalahan pada server.');
    }
};

module.exports = { uploadImageHandler };
