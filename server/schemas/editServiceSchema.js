const Joi = require('joi')
const Vehicle = require("./../models/Vehicle");
const editServiceSchema = Joi.object({
    title: Joi.string().max(20).min(3).required()
        .messages({
            'string.max': 'Title cannot be longer than 20 characters!',
            'string.min': 'Title must be at least 3 characters long',
            'any.required': 'Title is required'
        }),
    type: Joi.string().valid('regularService', 'oilService').required()
        .messages({
            'any.only': 'This type of service is not supported!',
            'string.base': 'Type has to be string!',
            'any.required': 'Type is required!'
        }),
    description: Joi.string().max(2000)
        .messages({
            'string.max': 'Description cannot be longer than 2000 characters!'
        }),
    date: Joi.date().iso().required()
        .messages({
            'date.base': 'Date must be a valid date format!',
            'date.format': 'Date must be in ISO format!',
            'any.required': 'Date is required!'
        }),
    mileage: Joi.number().min(0)
        .message({
            'number.base': 'Mileage must be a number!',
            'number.min': 'Mileage cannot be negative!'
        }),
    mileageTest: Joi.boolean().required()
        .messages({
            'boolean.base': 'MileageTest must be boolean!',
            'any.required': 'MileageTest is required!'
        }),
    cost: Joi.number(),
    vehicleID: Joi.required()
        .messages({
            'any.required': 'VehicleID is required!'
        }),
    userID: Joi.required()
        .messages({
            'any.required': 'UserID is required!'
      }),
    serviceID: Joi.required()
        .messages({
            'any.required': 'ServiceID is required!'
        })
}).external(async (value) => {
    const { userID, vehicleID } = value;
    try {
        const vehicle = await Vehicle.findById(vehicleID);
        if (!vehicle) {
            throw new Error('Vehicle not found! Try again later!');
        }
        const userHasPermission = vehicle.owners.some(owner =>
            owner.ownerID.toString() === userID.toString() &&
            ["Admin", "Owner"].includes(owner.role)
        );
        if (!userHasPermission) {
            throw new Error('Forbidden! You do not have permission!');
        }

        if(value.mileageTest){
            const { date, mileage } = value;
            const serviceDate = new Date(date);


            const sorted = [...vehicle.mileageTrack].sort(
                (a, b) => new Date(a.mileageDate) - new Date(b.mileageDate)
            );

            let previousEntry = null;
            let nextEntry = null;

            for (const entry of sorted) {
                const entryDate = new Date(entry.mileageDate);

                if (entryDate < serviceDate) {
                    previousEntry = entry;
                } else if (entryDate > serviceDate && !nextEntry) {
                    nextEntry = entry; 
                    break;
                }
            }


            if (nextEntry && mileage > nextEntry.mileage) {
                throw new Error(
                    `Mileage cannot be greater than the next recorded mileage.`
                );
            }

            if (previousEntry && mileage < previousEntry.mileage) {
                throw new Error(
                    `Mileage cannot be less than the previous recorded mileage.`
                );
            }

        }
    } catch (err) {
        throw err;
    }
})

module.exports = editServiceSchema;