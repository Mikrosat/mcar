const Joi = require('joi');
const Vehicle = require('./../models/Vehicle');

const addMileageLogSchema = Joi.object({
    mileage: Joi.number().min(0).required()
        .messages({
            'number.base': 'Mileage must be a number!',
            'number.min': 'Mileage cannot be negative!',
            'any.required': 'Mileage is required!'
        }),
    mileageDate: Joi.date().iso().required()
        .messages({
            'date.base': 'Date must be a valid date format!',
            'date.format': 'Date must be in ISO format!',
            'any.required': 'Date is required!'
        }),
    vehicleID: Joi.required()
        .messages({
            'any.required': 'VehicleID is required!'
        }),
    userID: Joi.required()
        .messages({
            'any.required': 'UserID is required!'
        }),
    mileageTest: Joi.boolean().truthy('true').falsy('false').required()
        .messages({
            'boolean.base': 'Mileage test must be boolean!',
            'any.required': 'Mileage test is required!'
        })
}).external(async (value) => {
    const {vehicleID, userID, mileageDate, mileage} = value;
    try{
        const vehicle = await Vehicle.findById(vehicleID);
        if(!vehicle){
            throw new Error('Vehicle not found! Try again later!');
        }
        const userHasPermission = vehicle.owners.some(owner =>
            owner.ownerID.toString() === userID.toString() &&
            ["Admin", "Owner"].includes(owner.role)
        );
        if(!userHasPermission){
            throw new Error('Forbidden! You do not have permission!');
        }
        if(value.mileageTest){
            const sorted = [...vehicle.mileageTrack].sort(
                (a,b) => new Date(a.mileageDate) - new Date(b.mileageDate)
            )
            let previousEntry = null;
            let nextEntry = null;

            for(const entry of sorted) {
                const entryDate = new Date(entry.mileageDate);
                if(entryDate < mileageDate){
                    previousEntry = entry;
                } else if (entryDate > mileageDate && !nextEntry){
                    nextEntry = entry;
                    break;
                }
            }

            if(nextEntry && mileage > nextEntry.mileage){
                throw new Error(
                    'Mileage cannot be greater than the next recorded mileage'
                );
            }
            if(previousEntry && mileage < previousEntry.mileage){
                throw new Error(
                    'Mileage cannot be less than the previous recorded mileage'
                )
            }
        }
    } catch (err){
        throw err;
    }
})

module.exports = addMileageLogSchema;