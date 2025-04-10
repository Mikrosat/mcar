const Joi = require('joi');

const loginSchema = Joi.object({
    login: Joi.string().alphanum().min(3).max(20).required(),
    password: Joi.string().min(8).max(35).required()
})

module.exports = loginSchema;