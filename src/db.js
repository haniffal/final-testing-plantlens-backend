const mysql = require('mysql2');

// Membuat koneksi ke MySQL
const connection = mysql.createConnection({
    host: '34.101.196.207',        // Ganti dengan IP instance MySQL Anda
    user: 'root',                  // Ganti dengan username MySQL Anda
    database: 'plantlens1',       // Ganti dengan nama database Anda
    password: '1234'        // Ganti dengan password MySQL Anda
    
});

// Mengecek koneksi
connection.connect((err) => {
    if (err) {
        console.error('Koneksi gagal:', err.message);
    } else {
        console.log('Berhasil terhubung ke database.');
    }
    
});

module.exports = connection ;