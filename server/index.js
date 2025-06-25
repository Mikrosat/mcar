const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

dotenv.config();

const port = process.env.BACKEND_PORT || 3000;
const blacklistStoringTime = 45;
const tokenExpireTime = 30;

const User = require('./models/User.js');
const Vehicle = require('./models/Vehicle.js');

const loginSchema = require("./schemas/loginSchema.js");
const registerSchema = require("./schemas/registerSchema.js");
const addServiceSchema = require("./schemas/addServiceSchema.js");
const addVehicleSchema = require("./schemas/addVehicleSchema.js");
const editServiceSchema = require("./schemas/editServiceSchema.js");
const addMileageLogSchema = require("./schemas/addMileageLogSchema.js");

const blacklistFilePath = path.join(__dirname, 'blacklist.json');


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
app.post("/api/register", async (req, res) => {
    const { name, surname, email, login, password, birthday } = req.body;

    let formattedBirthday = new Date(birthday + "T00:00:00");
    formattedBirthday.setMinutes(formattedBirthday.getMinutes() - formattedBirthday.getTimezoneOffset());

    try {
        await registerSchema.validateAsync({
            name,
            surname,
            email,
            login,
            password,
            birthdate: formattedBirthday
        });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            name,
            surname,
            email,
            birthday: formattedBirthday,
            login,
            password: hashedPassword
        });

        const savedUser = await newUser.save();

        return res.status(201).json({
            message: "User registered successfully!"
        });

    } catch (error) {
        if (error.isJoi) {
            return res.status(400).json({
                error: "Bad request",
                message: error.details[0].message
            });
        } else if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(409).json({
                error: "Conflict",
                message: `${field} is already in use!`
            });
        } else {
            console.error(`An unexpected error has been occured while registering new account: `, error);
            return res.status(500).json({
                error: "Internal server error",
                message: error.message || "An unexpected error occurred."
            });
        }
    }
});


app.post("/api/login", async (req, res) => {
    const {error} = loginSchema.validate(req.body);
    if(error){
        return res.status(400).json({
            error: "Bad request",
            message: error.details[0].message
        });
    }

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

        const accessToken = jwt.sign(user.toObject(), process.env.ACCESS_TOKEN_SECRET, {expiresIn: `${tokenExpireTime}m`});
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
    const {brand, model, mileage, productionYear} = req.body;
    const {error} = addVehicleSchema.validate({brand,model,mileage,productionYear});
    if(error){
        return res.status(400).json({
            error: "Bad request",
            message: error.details[0].message
        });
    }
    try{
        const now = new Date();
        const newVehicle = new Vehicle({
            brand: brand,
            model: model,
            productionYear: productionYear,
            owners: [{ownerID: req.userID, role: "Owner"}],
            mileageTrack: [
                {
                    mileageDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                    mileage: mileage,
                    isLog: false 
                }
            ],
            serivces: []
        });
        await newVehicle.save();
        return res.status(200).json({
            message: "Vehicle added!"
        })

    } catch(err){
        console.error('Error during vehicle creating: ',err.message);
        return res.status(500).json({
            error: "Internal server error!",
            message: "Internal server error! Try again later!"
        })
    }

});
app.post("/api/addService", authenticateToken, async (req, res) => {
    const {title, type, description, mileage, mileageTest, cost} = req.body;
    const date = new Date(req.body.date);
    let vehicleID = req.body.vehicleID;
    if(mongoose.Types.ObjectId.isValid(req.body.vehicleID)){
        vehicleID = new mongoose.Types.ObjectId(`${req.body.vehicleID}`);
    }
    try {
        const value = await addServiceSchema.validateAsync({
            title,
            type,
            description,
            mileage,
            mileageTest,
            cost,
            date,
            vehicleID,
            userID: req.userID,
        });
    } catch (error) {
        return res.status(400).json({
            error: "Bad Request",
            message: error.details?.map(detail => detail.message).join(', ') || error.message
        });
    }
    const mileageID = new mongoose.Types.ObjectId();

    const newMileage = {
        mileageDate: date,
        mileage: mileage,
        _id: mileageID,
        isLog: false
    };
    const newService = {
        title: title,
        type: type,
        date: date,
        description: description,
        mileage: mileageID,
        cost: cost
    }
    try{
        const vehicle = await Vehicle.findById(vehicleID);
        vehicle.services.push(newService);
        vehicle.mileageTrack.push(newMileage);
        await vehicle.save();
        return res.status(200).json({
            message: "Service added!"
        })
    } catch (err){
        return res.status(500).json({
            error: "Internal server error!",
            message: "Internal server error! Try again later!"
        });
    }
})
app.post("/api/editService", authenticateToken, async (req, res) => {
    const {title,type,description,mileage,mileageTest,cost} = req.body;
    const date = new Date(req.body.date);
    let vehicleID, serviceID;
    if(mongoose.Types.ObjectId.isValid(req.body.vehicleID)){
        vehicleID = new mongoose.Types.ObjectId(`${req.body.vehicleID}`);
    }
    if(mongoose.Types.ObjectId.isValid(req.body.serviceID)){
        serviceID = new mongoose.Types.ObjectId(`${req.body.serviceID}`);
    }
    try{
        const value = await editServiceSchema.validateAsync({
            title,
            type,
            description,
            mileage,
            mileageTest,
            cost,
            date,
            userID: req.userID,
            serviceID,
            vehicleID
        })
    } catch (error){
        return res.status(400).json({
            error: "Bad Request",
            message: error.details?.map(detail => detail.message).join(', ') || error.message
        });
    }
    try{
        const vehicle = await Vehicle.findById(vehicleID);

        const serviceIndex = vehicle.services.findIndex(s => s._id.equals(serviceID));

        if (serviceIndex > -1) {

            const mileageID = vehicle.services[serviceIndex].mileage;

            const mileageTrackIndex = vehicle.mileageTrack.findIndex(m => m._id.equals(mileageID));

            if (mileageTrackIndex > -1) {
                const newServiceObject = {
                    title: title,
                    type: type,
                    description: description,
                    mileage: mileageID,
                    cost: cost,
                    date: date,
                    _id: serviceID
                };

                const newMileageObject = {
                    mileageDate: date,
                    mileage: mileage,
                    _id: mileageID,
                    isLog: false
                };

                vehicle.services[serviceIndex] = newServiceObject;
                vehicle.mileageTrack[mileageTrackIndex] = newMileageObject;

                await vehicle.save();

                return res.status(200).json({
                    message: "Service edited!"
                });
            }
}
return res.status(404).json({
    error: "Not found!",
    message: "ServiceID or Mileage not found"
});
    } catch (err){
        console.error("An error has been occured while editing service: ",err);
        return res.status(500).json({
            error: "Internal server error!",
            message: "Internal server error! Try again later!"
        })
    }
})
app.post("/api/addMileageLog", authenticateToken, async (req, res) => {
    const {mileage, mileageDate, mileageTest} = req.body;
    let vehicleID;
    if(mongoose.Types.ObjectId.isValid(req.body.vehicleID)){
        vehicleID = new mongoose.Types.ObjectId(`${req.body.vehicleID}`)
    } else {
        return res.status(400).json({
            error: "Invalid vehicle ID!",
            message: "Provided vehicle ID is incorrect!"
        })
    }
    try{
        await addMileageLogSchema.validateAsync({
            mileage, 
            mileageDate,
            vehicleID,
            userID: req.userID,
            mileageTest
        })
    } catch (error){
        return res.status(400).json({
            error: "Bad Request",
            message: error.details?.map(detail => detail.message).join(', ') || error.message
        });
    }
    try{
        const vehicle = await Vehicle.findById(vehicleID);

        const newMileageLog= {
            mileageDate: mileageDate,
            mileage: mileage,
            isLog: true
        }

        vehicle.mileageTrack.push(newMileageLog);
        await vehicle.save()
        return res.status(200).json({
            message: "Mileage log saved!"
        })
    } catch (err){
        console.error("An error has been occured while adding mileage log: ",err);
        return res.status(500).json({
            error: "Internal server error!",
            message: "Internal server error! Try again later!"
        })
    }
})
app.delete("/api/deleteVehicle", authenticateToken, async (req, res) => {
    try{
        const {vehicleID} = req.body;

        if(!mongoose.Types.ObjectId.isValid(vehicleID)){
            return res.status(400).json({
                error: "Invalid ID",
                message: "The provided ID is not valid. Please check and try again"
            })
        }
        const vehicle = await Vehicle.findById(vehicleID);
        if(!vehicle){
            return res.status(404).json({
                error: "Vehicle not found!"
            });
        }
        const hasAccess = vehicle.owners.some(owner =>
            owner.ownerID.toString() === req.userID && owner.role === 'Owner'
        );
        if(!hasAccess){
            return res.status(401).json({
                error: "Access denied!",
                message: "You do not have permission to delete this vehicle!"
            })
        }
        await vehicle.deleteOne();
        return res.status(200).json({
            message: "Vehicle deleted!"
        });
    } catch(err){
        console.error("An error has been occured while deleting vehicle: ",err);
        return res.status(500).json({
            error: "Internal server error!",
            message: "Internal server error! Try again later!"
        })
    }
})
app.delete("/api/deleteService", authenticateToken, async (req, res) => {
    try{
        const {vehicleID, serviceID} = req.body;
        if(!mongoose.Types.ObjectId.isValid(vehicleID)){
            return res.status(400).json({
                error: "Invalid vehicle ID",
                message: "The provided vehicle ID is not valid. Please check and try again later"
            });
        }
        if(!mongoose.Types.ObjectId.isValid(serviceID)){
            return res.status(400).json({
                error: "Invalid service ID",
                message: "The provided service ID is not valid. Please check and try again later"
            })
        }

        const vehicle = await Vehicle.findById(vehicleID);
        
        if(!vehicle)
            return res.status(404).json({
                error: "Not found!",
                message: "Vehicle at provided ID does not exist!"
            })

        const hasAccess = vehicle.owners.some(owner =>
            owner.ownerID.toString() === req.userID &&
            (owner.role === 'Owner' || owner.role === 'Admin')
        );

        if(!hasAccess){
            return res.status(401).json({
                error: "Unathorized",
                message: "You do not have permission to delete service!"
            })
        }
        const index = vehicle.services.findIndex(i => i._id.equals(serviceID));
        if(index === -1)
            return res.status(404).json({
                error: "Not found!",
                message: "Service at provided ID does not exist!"
            });
        const serviceToRemove = vehicle.services.splice(index,1)[0];
        const mileageID = serviceToRemove.mileage;
        const mileageIndex = vehicle.mileageTrack.findIndex(i => i._id.equals(mileageID));
        if(mileageIndex === -1)
            return res.status(500).json({
                error: "Internal server error!",
                message: "Unexcpected server error! Contact admin"
        })
        vehicle.mileageTrack.splice(mileageIndex,1)[0];
        await vehicle.save();
        return res.status(200).json({
            message: "Service deleted!"
        })
    } catch (err){
        console.error("An error has been occured while deleting service: ",err);
        return res.status(500).json({
            error: "Internal server error!",
            message: "Internal server error! Try again later!"
        })
    }
})
app.get("/api/getAllVehicles", authenticateToken, async (req, res) => {
    try{
        const vehicles = await Vehicle.find({
            'owners.ownerID': req.userID
        },{ 
            brand: 1,
            model: 1,
            productionYear: 1,
            _id: 1
        });
        return res.status(200).json(vehicles);
    } catch(err){
        console.error("An error has been occured while getting vehicles: ", err);
        return res.status(500).json({ error: "Internal server error!", message: "Internal server error! Try again later!"});
    }
});
app.get("/api/getVehicleDetails/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const vehicle = await Vehicle.findById(id).lean(); 

        if (!vehicle) {
            return res.status(404).json({ error: "Vehicle not found" });
        }

        const hasAccess = vehicle.owners.some(owner => owner.ownerID.toString() === req.userID);
        if(!hasAccess){
            return res.status(403).json({ error: "Access denied", message: "You do not have access to this vehicle!"});
        }

        const mileageMap = new Map(vehicle.mileageTrack.map(mt => [mt._id.toString(), mt.mileage]));

        vehicle.services = vehicle.services.map(service => ({
            ...service,
            mileage: mileageMap.get(service.mileage.toString()) ?? service.mileage
        }));

        return res.status(200).json(vehicle);
    } catch (err) {
        console.error('An error occurred while getting vehicle details: ', err);
        return res.status(500).json({
            error: "Internal server error!",
            message: "Internal server error! Try again later!"
        });
    }
});

app.listen(port, (req, res) => { console.log(`Server is running on port: ${port}`)});
