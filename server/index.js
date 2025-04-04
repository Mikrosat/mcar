const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const port = 3000; //backend port
const blacklistStoringTime = 45; //minutes
const tokenExpireTime = 30; //minutes

const User = require('./models/User.js');
const Vehicle = require('./models/Vehicle.js');

const blacklistFilePath = path.join(__dirname, 'blacklist.json');

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

setInterval(() => {
    cleanExpiredTokens();
}, 5 * 60 * 1000);


mongoose.connect(process.env.MONGODB_URL)
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('Error connecting to MongoDB: ',err));

function readBlacklist(){
    if(!fs.existsSync(blacklistFilePath)) return [];
    try{
        const data = fs.readFileSync(blacklistFilePath, 'utf8');
        return JSON.parse(data);
    }
    catch (err){
        console.error('Error reading blacklist.json file: ',err);
        return [];
    }
}
function writeBlacklist(blacklist){
    fs.writeFileSync(blacklistFilePath, JSON.stringify(blacklist, null, 2), 'utf8');
}
function cleanExpiredTokens(){
    const blacklist = readBlacklist();
    const currentTime = Date.now();
    const filteredBlacklist = blacklist.filter(entry => entry.expireTime > currentTime);

    writeBlacklist(filteredBlacklist);
}
function addToBlacklist(token){
    const blacklist = readBlacklist();
    const expiryTime = Date.now() + blacklistStoringTime * 60 * 1000;
    blacklist.push({token, expiryTime});
    writeBlacklist(blacklist);
}
function authenticateToken(req, res, next) {
    const token = req.cookies.jwt;
    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: "Forbidden" });
        }
        addToBlacklist(token);

        res.clearCookie('jwt', {httpOnly: true, secure: true, sameSite: 'Strict'});


        const newToken = jwt.sign({ _id: decoded._id}, process.env.ACCESS_TOKEN_SECRET, { expiresIn: `${tokenExpireTime}m`});

        res.cookie('jwt', newToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: tokenExpireTime * 60 * 1000,
        });
        req.userID = decoded._id;
        next();
    });
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
function isServiceTypeGood(type){
    if(type === 'oilService' || type == "regularService")
        return false;
    else
        return true;
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
        res.cookie('jwt', accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: tokenExpireTime*60*1000,
        })
        res.status(200).json({ message: "Logged in!"});
    } catch (err){
        console.error('An error has been occured while login: ', err)
        return res.status(500).json({
            error: "Internal server error",
            message: "Try again later!"
        })
    }
});
app.post("/api/addVehicle", authenticateToken, async (req, res) => {
    const {brand, model, mileage} = req.body;
    const yearProduction = parseInt(req.body.yearProduction);
    if(!brand || brand.length < 3 || brand.length > 20){
        res.status(422).json({
            error: "Invalid brand input",
            message: "Brand cannot be empty, have more than 20 characters or less than 3 characters!"
        });
    }
    else if(!model || model.length < 3 || model.length > 20){
        res.status(422).json({
            error: "Invalid model input",
            message: "Model cannot be empty, have more than 20 characters or less than 3 characters!"
        });
    }
    else if(!yearProduction){
        res.status(422).json({
            error: "Invalid year production input",
            message: "Year production cannot be empty or contain characters!"
        });
    }
    else if(typeof mileage !== 'number' || isNaN(mileage)){
        res.status(422).json({
            error: "Invalid mileage input",
            message: "Mileage cannot be empty or contain characters!"
        });
    }
    else{
        const addNewVehicle = async () => {
            try{
                const newVehicle = new Vehicle({
                    brand: brand,
                    model: model,
                    yearProduction: yearProduction,
                    owners: [{ownerID: req.userID, role: "Owner"}],
                    mileageTrack: [
                        {
                            mileageDate: new Date(),
                            mileage: mileage
                        }
                    ],
                    services: []
                });
                await newVehicle.save();
                return newVehicle;
            } catch (err){
                console.error("Error during vehicle creating: ",err.message);
                throw err;
            }
        }
        try{
            const savedVehicle = await addNewVehicle();
            res.status(200).json({
                message: "Vehicle added!"
            });
        } catch (err){
            console.error("Error during vehicle creating: ",err.message);
            res.status(500).json({
                error: "Internal server error",
                message: "Internal server error occured while adding new vehicle! Try again later"
            });
        }

    }
});
app.post("/api/addService", authenticateToken, async (req, res) => {
    const {title, type, description, mileage, mileageTest, cost} = req.body;
    const date = new Date(req.body.date);
    let vehicleID = req.body.vehicleID;
    if(mongoose.Types.ObjectId.isValid(req.body.vehicleID)){
        vehicleID = new mongoose.Types.ObjectId(`${req.body.vehicleID}`);
    }
    else{
        return res.status(422).json({
            error: "Invalid vehicle ID value",
            message: "Vehicle ID is invalid!"
        })
    }
    
    if(!title || title.length < 3 || title.length > 20){
        return res.status(422).json({
            error: "Invalid title input",
            message: "Title cannot be empty, and have to have 3-20 characters!" 
        });
    }
    else if(!vehicleID){
        return res.status(422).json({
            error: "Invalid vehicleID input",
            message: "VehicleID is invalid!"
        })
    }
    else if(!type || isServiceTypeGood(type)){
        return res.status(422).json({
            error: "Invalid type input",
            message: "The type cannot be empty and must match a supported type!"
        });
    }
    else if(description.length > 2000){
        return res.status(422).json({
            error: "Invalid description input",
            message: "Description can't be longer than 2000 characters"
        });
    }
    else if(!date || !(date instanceof Date) || isNaN(date.getTime())){
        return res.status(422).json({
            error: "Invalid date input",
            message: "Date must be a date format!"
        });
    }
    else if(typeof mileage !== 'number' || isNaN(mileage)){
        return res.status(422).json({
            error: "Invalid mileage input",
            message: "Mileage must be a number!"
        })
    }
    else if(typeof cost !== 'number' || isNaN(cost)){
        return res.status(422).json({
            error: "Invalid cost input",
            message: "Cost must be number!"
        });
    }
    else if(typeof mileageTest !== 'boolean'){
        return res.status(422).json({
            error: "Invalid mileage test value!",
            message: "."
        })
    }
    else{
        if(mileageTest){
            const mileageObject = await Vehicle.findOne({
                _id: vehicleID,
                "mileageTrack.mileageDate": { $lte: new Date(date) }
            }, {
                "mileageTrack": {
                    $elemMatch: { mileageDate: { $lte: new Date(date) } }
                }
            });
            if(mileageObject?.mileageTrack[0].mileage > mileage){
                return res.status(422).json({
                    error: "Invalid mileage input",
                    message: "Last mileage is higher then now, typo or ilegal actions?"
                })
            }
        }
        const newService = {
            title: title,
            type: type,
            date: date,
            description: description,
            mileage: mileage,
            cost: cost
        }
        try{
            const vehicle = await Vehicle.findById(vehicleID);
            if(!vehicle){
                return res.status(404).json({
                    error: "Vehicle not found!",
                    message: "Vehicle is not in database, check if all data is correct and try again later"
                })
            }
            const userHasPermission = vehicle.owners.some(owner =>
                owner.ownerID.toString() === req.userID.toString() && ["Admin", "Owner"].includes(owner.role)
            );
            if(!userHasPermission){
                return res.status(403).json({ error: "Forbidden", message: "You do not have permission!"});
            }
            vehicle.services.push(newService);
            await vehicle.save();
            return res.status(200).json({
                message: "Service added!"
            })

        } catch (err){
            console.error("An error has been occured while adding vehicle: ",err);
            return res.status(500).json({
                error: "Internal server error",
                message: "Internal server error! Try again later"
            });
        }
    }
});;
app.get("/api/test", authenticateToken, (req, res) => {
    res.status(200).json({message: "Authorized access"})
})

app.listen(port, (req, res) => { console.log(`Server is running on port: ${port}`)});