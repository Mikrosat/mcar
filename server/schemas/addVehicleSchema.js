const Joi = require('joi');

const currentYear = new Date().getFullYear();

const addVehicleSchema = Joi.object({
    brand: Joi.string().max(20).min(3).required()
        .messages({
            'string.base': 'Brand have to be text!',
            'string.max': 'Brand cannot be longer than 20 characters!',
            'string.min': 'Brand must be at least 3 characters long',
            'any.required': 'Brand is required!'
        }),
    model: Joi.string().max(20).min(3).required()
        .messages({
            'string.base': 'Model have to be text!',
            'string.max': 'Model cannot be longer than 20 characters!',
            'string.min': 'Model must be at least 3 characters long',
            'any.required': 'Model is required'
        }),
    mileage: Joi.number().integer().min(0).required()
        .messages({
            'number.base': 'Mileage must be integer!',
            'number.integer': 'Mileage must be integer!',
            'number.min': 'Mileage cannot be negative!',
            'any.required': 'Mileage is required'
        }),
    productionYear: Joi.number().integer().min(1800).max(currentYear).required()
        .messages({
            'number.base': "Production year must be a number!",
            'number.integer': "Production year must be an integer!",
            'number.min': `Production year have to be beetwen 1800-${currentYear}`,
            'number.max': `Production year have to be beetwen 1800-${currentYear}`,
            'any.required': 'Production year is required!'
        })
})

module.exports = addVehicleSchema