const Joi = require('joi');
const bcrypt = require('bcryptjs');
const User = require('./../models/User');

const changePasswordSchema = Joi.object({
    oldPassword: Joi.string().min(8).max(35).required()
        .messages({
            'any.required': 'Old password is required!',
            'string.min': 'Old password cannot be shorter than 8 characters!',
            'string.max': 'Old password cannot be longer than 35 characters!',
            'string.alphanum': 'Only alphanumeric characters are allowed'
        }),
    newPassword: Joi.string().min(8).max(35).required()
        .messages({
            'any.required': 'New password is required!',
            'string.min': 'New password cannot be shorter than 8 characters!',
            'string.max': 'New password cannot be longer than 35 characters!',
            'string.alphanum': 'New alphanumeric characters are allowed'
        }),
    userID: Joi.string().required()
        .messages({
            'any.required': 'User ID is required!'
        })
})
.external(async (value, helpers) => {
    const {userID, oldPassword} = value;
    const user = await User.findById(userID);
    if(!user)
        return helpers.message('Provided user ID is incorrect! Not found!');
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if(!isMatch)
        return helpers.message('Unathorized! Old password is wrong!');
    return true;

}, 'Custom validation');

module.exports = changePasswordSchema;