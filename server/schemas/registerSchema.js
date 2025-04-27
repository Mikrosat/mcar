const Joi = require('joi');

const User = require('./../models/User')

const minAge = parseInt(process.env.MIN_AGE ?? '13', 10);
const minAgeDate = new Date();
minAgeDate.setFullYear(minAgeDate.getFullYear() - minAge);

async function isLoginOrEmailUnique(login, email){
    const existingUser = await User.findOne({
        $or: [{login}, {email}]
    });
    return existingUser;
}

const registerSchema = Joi.object({
  name: Joi.string().max(30).min(3).pattern(/^[^\d]*$/).required()
    .messages({
      'string.pattern.base': 'Name cannot contain numbers',
      'string.max': 'Name cannot be more than 30 characters',
      'string.min': 'Name must be at least 3 characters',
      'any.required': 'Name is required'
    }),

  surname: Joi.string().max(30).min(3).pattern(/^[^\d]*$/).required()
    .messages({
      'string.pattern.base': 'Surname cannot contain numbers',
      'string.max': 'Surname cannot be more than 30 characters',
      'string.min': 'Surname must be at least 3 characters',
      'any.required': 'Surname is required'
    }),

  email: Joi.string().email().required()
    .messages({
      'string.email': 'Email must be a valid email address',
      'any.required': 'Email is required'
    }),

  login: Joi.string().alphanum().min(3).max(20)
    .pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).required()
    .messages({
      'string.pattern.base': 'Login cannot start with a number',
      'string.max': 'Login cannot be more than 20 characters',
      'string.min': 'Login must be at least 3 characters',
      'any.required': 'Login is required'
    }),

  password: Joi.string().min(8).max(35).required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.max': 'Password cannot be more than 35 characters',
      'any.required': 'Password is required'
    }),

  birthdate: Joi.date()
    .max(minAgeDate)
    .required()
    .messages({
      'date.base': 'Invalid birthdate format',
      'date.max': `You must be at least ${minAge} years old.`,
      'any.required': 'Birthdate is required'
    })
})
.external(async (value, helpers) => {
    const {login, email} = value;

    const existingUser = await isLoginOrEmailUnique(login,email);
    if(existingUser){
        if(existingUser.login === login){
            return helpers.message('Login is already in use! Log in!');
        }
        if(existingUser.email === email){
            return helpers.message('Email is already in use! Log in!');
        }
    }
    return true;
}, 'Custom validation');

module.exports = registerSchema;