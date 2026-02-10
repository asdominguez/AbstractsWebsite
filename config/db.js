require('dotenv').config();
const mongoose = require('mongoose');

/**
 * Connect to the MongoDB database based on given environment.
 * @param {*} where connects to test database
 */
exports.connect = function(where){
    let uri = process.env.DB_URI; //production DB
    //if(where==='test') uri = process.env.TESTDB_URI; //Test DB

    return mongoose.connect(uri);
}

/**
 * Disconnect from the MongoDB database
 */
exports.disconnect = async function(){
    await mongoose.connection.close();
}