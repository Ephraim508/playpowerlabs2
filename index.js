const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

mongoose.connect('mongodb://localhost:27017/StudentManageSystem', { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', () => console.log("Error in Connecting to Database"));
db.once('open', () => console.log("Connected to Database"));

const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String
}, { collection: 'loginDetails' });

userSchema.pre('save', async function (next) {
    if (this.isModified('password')) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
    next();
});

userSchema.methods.comparePassword = function (password) {
    return bcrypt.compare(password, this.password);
};

const User = mongoose.model('User', userSchema);

const assignmentSchema = new mongoose.Schema({
    title: String,
    description: String,
    dueDate: Date,
    uniqueNo: { type: Number, unique: true } // Ensure uniqueNo is included and unique
}, { collection: 'assignmentDetails' });

const Assignment = mongoose.model('Assignment', assignmentSchema);

const sequenceSchema = new mongoose.Schema({
    name: { type: String, unique: true },
    seq: { type: Number, default: 0 }
});

const Sequence = mongoose.model('Sequence', sequenceSchema);

async function getNextUniqueNo() {
    const sequence = await Sequence.findOneAndUpdate(
        { name: 'assignmentUniqueNo' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return sequence.seq;
}

async function initializeSequence() {
    const existingSequence = await Sequence.findOne({ name: 'assignmentUniqueNo' });
    if (!existingSequence) {
        await Sequence.create({ name: 'assignmentUniqueNo', seq: 0 });
    }
}

initializeSequence();

app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;

    try {
        const newUser = new User({
            name,
            email,
            password
        });

        await newUser.save();
        res.send("Registered Successfully");
    } catch (error) {
        console.error("Error in /register:", error);
        res.status(400).send(error.message);
    }
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).send("User not found");
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).send("Invalid credentials");
        }

        res.send("Login Successful");
    } catch (error) {
        console.error("Error in /login:", error);
        res.status(400).send(error.message);
    }
});

app.post("/assignments", async (req, res) => {
    const { title, description, dueDate, uniqueNo } = req.body;

    try {
        const parsedDueDate = new Date(dueDate);

        if (isNaN(parsedDueDate.getTime())) {
            return res.status(400).send("Invalid date format. Please use YYYY-MM-DD.");
        }

        let newUniqueNo;

        if (uniqueNo === undefined) {
            newUniqueNo = await getNextUniqueNo();
        } else {
            newUniqueNo = uniqueNo;
            const existingAssignment = await Assignment.findOne({ uniqueNo: newUniqueNo });
            if (existingAssignment) {
                return res.status(400).send("Unique number already exists. Please provide a different unique number or omit it to auto-generate.");
            }
        }

        const newAssignment = new Assignment({
            title,
            description,
            dueDate: parsedDueDate,
            uniqueNo: newUniqueNo
        });

        await newAssignment.save();
        res.send("Assignment Created Successfully");
    } catch (error) {
        console.error("Error in /assignments:", error);
        res.status(400).send(error.message);
    }
});

app.delete("/assignments/:uniqueNo", async (req, res) => {
    const { uniqueNo } = req.params;

    try {
        // First find the assignment by uniqueNo
        const assignment = await Assignment.findOne({ uniqueNo });

        if (!assignment) {
            return res.status(404).send("Assignment not found");
        }

        // Then delete the found assignment
        await Assignment.deleteOne({ uniqueNo });

        res.send("Assignment Deleted Successfully");
    } catch (error) {
        console.error("Error in /assignments/:uniqueNo:", error);
        res.status(500).send("Internal Server Error");
    }
});


app.get("/assignments/:uniqueNo", async (req, res) => {
    const { uniqueNo } = req.params;

    try {
        const assignment = await Assignment.findOne({ uniqueNo });

        if (!assignment) {
            return res.status(404).send("Assignment not found");
        }

        res.json(assignment);
    } catch (error) {
        console.error("Error in /assignments/:uniqueNo:", error);
        res.status(500).send("Internal Server Error");
    }
});


app.put("/assignments/:uniqueNo", async (req, res) => {
    const { uniqueNo } = req.params;
    const { title, description, dueDate } = req.body;

    try {
        // Validate the date format if provided
        let parsedDueDate;
        if (dueDate) {
            parsedDueDate = new Date(dueDate);
            if (isNaN(parsedDueDate.getTime())) {
                return res.status(400).send("Invalid date format. Please use YYYY-MM-DD.");
            }
        }

        // Step 1: Find the assignment
        const assignment = await Assignment.findOne({ uniqueNo });

        if (!assignment) {
            return res.status(404).send("Assignment not found");
        }

        // Step 2: Update the found assignment
        if (title !== undefined) {
            assignment.title = title;
        }
        if (description !== undefined) {
            assignment.description = description;
        }
        if (parsedDueDate !== undefined) {
            assignment.dueDate = parsedDueDate;
        }

        // Save the updated assignment
        const updatedAssignment = await assignment.save();

        res.json(updatedAssignment);
    } catch (error) {
        console.error("Error in /assignments/:uniqueNo:", error);
        res.status(500).send("Internal Server Error");
    }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
