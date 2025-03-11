const mongoose = require("mongoose");

const ownersSchema = new mongoose.Schema({
    ownerID: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    role: {
        type: String,
        required: true,
        enum: ['Owner', 'Admin', 'Guest']
    }
})
const mileageTrackSchema = new mongoose.Schema({
    mileageDate: {
        type: Date,
        required: true,
    },
    mileage: {
        type: Number,
        required: true
    }
})
const servicesSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    type: {
        type: String,
        enum: ['oilService', 'regularService'],
        required: true
    },
    description: {
        type: String,
        required: true,
        trim: true,
    },
    date: {
        type: Date,
        required: true,
    },
    mileage: {
        type: Number,
        required: true
    }
})
const vehicleSchema = new mongoose.Schema({
    brand: {
        type: String,
        required: true,
        trim: true,
    },
    model: {
        type: String,
        required: true,
        trim: true,
    },
    yearProduction: {
        type: Number,
        required: true,
    },
    owners: [ownersSchema],
    mileageTrack: [mileageTrackSchema],
    services: [servicesSchema]
});
