const { getHistoryHandler, uploadImageAndPredictHandler, getPlantData, getDiseaseSolutions } = require('./handler');

const routes = [
    {
        method: 'GET',
        path: '/',
        handler: () => {
            return { status: 'success', message: 'Welcome to the API' };
        },
      },
      {
        method: 'GET',
        path: '/plants/{id_tanaman}',
        handler: getPlantData
    },
    {
        method: 'GET',
        path: '/diseases-solutions',
        handler: getDiseaseSolutions
    },
    {
        method: 'GET',
        path: '/history',
        handler: getHistoryHandler,
    },
    {
        method: 'POST',
        path: '/predict',
        handler: uploadImageAndPredictHandler,
        options: {
            payload: {
                allow: 'multipart/form-data',
                multipart: true,
                output: 'stream', // Output sebagai stream untuk file upload
                parse: true,
                maxBytes: 5 * 1024 * 1024, // Batas ukuran file (5 MB)
            },
        },
    },

];

module.exports = routes;
