const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    login: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 8,
    },
    name: {
        type: String,
        required: true
    },
    surname: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        trim: false,
        unique: true
    },
    birthday: {
        type: Date,
        required: true
    }
})

module.exports = mongoose.model("User", userSchema);