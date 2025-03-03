const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const port = 3000;

const User = require('./models/User.js');

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.connect(process.env.MONGODB_URL)
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('Error connecting to MongoDB: ',err));

function authenticateToken(req,res,next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token === null) return res.sendStatus(401).json({ message: "Unauthorized" })

        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
            if(err) return res.sendStatus(403);
            req.user = user;
            next();
        })
}
function isEmailGood(email){
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if(!emailRegex.test(email))
        return false;
    if([...email].some(c => c.charCodeAt(0) >= 128))
        return false;

    return true;
}
function isFirstCharacterDigit(str){
    if (str && str.length > 0)
        return /^\d/.test(str.charAt(0));
    return true;
}
function userAge(birthday){
    const today = new Date();
    let birthDate = new Date(birthday);

    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDifferance = today.getMonth() - birthDate.getMonth();
    if (monthDifferance < 0 || (monthDifferance === 0 && today.getDate() < birthDate.getDate()))
        age--;
    return age;
}
async function isUserExist(lookingFor, value){
    try {
        const user = await User.findOne({ [lookingFor]: value});
        return !!user;
    } catch(err){
        console.error('An error has been occured while checking is user exist: ',err);
        return true;
    }
}

app.post("/api/register", async (req, res) => {
    const {name, surname, email, login, password, birthday} = req.body;
    console.log(birthday)
    let formattedBirthday = new Date(birthday + "T00:00:00");
    formattedBirthday.setMinutes(formattedBirthday.getMinutes() - formattedBirthday.getTimezoneOffset());
    console.log(formattedBirthday)

    if(!name || name > 30 || /\d/.test(name)){
        res.status(422).json({
            error: "Invalid name input",
            message: "Name cannot be empty, have more than 30 characters or contains digits!"
        });
    }
    else if(!surname || surname > 30 || /\d/.test(surname)){
        res.status(422).json({
            error: "Invalid surname input",
            message: "Surname cannot be empty, have more than 30 characters or constains digits!"
        });
    }
    else if(!isEmailGood(email)){
        res.status(422).json({
            error: "Invalid email input",
            message: "Email is incorrect!"
        })
    }
    else if(await isUserExist("email", email)){
        console.log(birthday);
        res.status(409).json({
            error: "Email occupied",
            message: "User with this email adress already exist!"
        })
    }
    else if(!login || login > 20 || login < 3 || isFirstCharacterDigit(login)){
        res.status(422).json({
            error: "Invalid login input",
            message: "Login cannot starts with digid and has to be 3-20 characters long!"
        })
    }
    else if(await isUserExist("login", login)){
        res.status(409).json({
            error: "Login occupied",
            message: "User with this login already exist!"
        })
    }
    else if(!password || password.length > 35 || password.length < 8){
        res.status(422).json({
            error: "Invalid password input",
            message: "Password have to be 8-35 characters long!"
        })
    }
    else if(!formattedBirthday || isNaN(formattedBirthday.getTime())){
        res.status(422).json({
            error: "Invalid birthday input",
            message: "Birthday is invalid!"
        })
    }
    else if(userAge(formattedBirthday) < 13){
        res.status(422).json({
            error: "Invalid birthday input",
            message: "User is too young to use website!"
        })
    }
    else{
        const addUser = async () => {
            const hashedPassword = await bcrypt.hash(password, 10);
            try {
                const newUser = new User({
                    name: name,
                    surname: surname,
                    email: email,
                    birthday: formattedBirthday,
                    login: login,
                    password: hashedPassword
                });
                await newUser.save();
                return newUser;
            } catch(err){
                console.error("Error during user registration: ",err.message);
                res.status(500).json({
                    error: "Internal server error",
                    message: "Internal server error occured while registering! Try again later!"
                });
                throw error;
            }
        }
        try{
            const savedUser = await addUser();
            res.status(200).json({
                message: "User registered!"
            })
        } catch (err){
            console.error("An error has been occured while registering user: ",err);
            res.status(500).json({
                error: "Internal server error",
                message: "Internal server error occured while registering! Try again later!"
            });
        }
    }
});
app.post("/api/login", async (req, res) => {
    const { login, password } = req.body;
    try{
        const user = await User.findOne({ login });
        if(!user){
            return res.status(404).json({
                error: "Not found",
                message: "Incorrect login!"
            });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if(!isMatch){
            return res.status(401).json({
                error: "Unauthorized",
                message: "Wrong password!"
            });
        }

        const accessToken = jwt.sign(user.toObject(), process.env.ACCESS_TOKEN_SECRET);
        res.status(200).json({ accessToken: accessToken});
    } catch (err){
        console.error('An error has been occured while login: ', err)
        return res.status(500).json({
            error: "Internal server error",
            message: "Try again later!"
        })
    }
});
app.get("/api/test", authenticateToken, (req, res) => {
    res.status(200).json({message: "Authorized access"})
})

app.listen(port, (req, res) => { console.log(`Server is running on port: ${port}`)});