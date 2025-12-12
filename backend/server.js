const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
app.post("/api/signup", async (req, res) => {
    try {
    const { name, email, user_type, organization_name, organization_id, password } = req.body;
        if (!email || !user_type || !password) {
            return res.status(400).json({ message: 'Email, user_type and password are required' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const ruselt = await pool.query(
        `INSERT INTO users (name, email, user_type, organization_name, organization_id, password) 
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, user_type, organization_name, organization_id`,
        [name || null, email, user_type, organization_name || null, organization_id || null, hashedPassword]
    );
    res.status(201).json(ruselt.rows[0]);
    console.log("REQ BODY:", req.body);

    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
})

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validation
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    // 2. Find user
    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        message: "Invalid email or password"
      });
    }

    const user = userResult.rows[0];

    // 3. Compare bcrypt password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({
        message: "Invalid email or password"
      });
    }

    // 4. Success
    return res.status(200).json({
      message: "Login successful",
      user: {

        email: user.email,
        name: user.name,
      }
    });

  } catch (error) {
    console.error("Error logging in:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});


app.listen(5000, () => {
  console.log("Server running on port 5000");
});
