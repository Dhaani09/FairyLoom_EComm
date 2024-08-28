const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const { Pool } = require('pg');
const path = require('path');
const session = require('express-session');
const app = express();
const port = 3000;

// Database connection
const db = new Pool({
    connectionString: process.env.DATABASE_URL, // Using the environment variable for the database URL
    ssl: {
        rejectUnauthorized: false // This is necessary for some hosted PostgreSQL services like Render
    }
});

db.connect((err, client, release) => {
    if (err) {
        console.error('Error acquiring client', err.stack);
    } else {
        console.log('PostgreSQL connected...');
        release();
    }
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Setup multer
const upload = multer();
app.use(upload.array()); // For parsing multipart/form-data

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Set up sessions
app.use(session({
    secret: 'your_secret_key', // Change this to a strong secret
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));
db.query(`
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        firstName VARCHAR(255) NOT NULL,
        surName VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL
    );
`, (err, result) => {
    if (err) {
        console.error('Error creating users table:', err);
    } else {
        console.log('Users table ready.');
    }
});

db.query(`
    CREATE TABLE cart (
    id SERIAL PRIMARY KEY,  -- Auto-incrementing unique identifier for each cart item
    email VARCHAR(255) NOT NULL,  -- User's email to associate the cart item with the user
    product_id VARCHAR(255) NOT NULL,  -- Unique identifier for the product
    product_name VARCHAR(255) NOT NULL,  -- Name of the product
    product_quantity INTEGER NOT NULL CHECK (product_quantity > 0), 
    price NUMERIC(10, 2) NOT NULL,  -- Price of the product
    pic VARCHAR(255),  -- URL or path to the product image
    size VARCHAR(50),  -- Size of the product (optional)
    UNIQUE(email, product_id)  -- Ensures that each user can have only one entry per product in the cart
    );
`, (err, result) => {
    if (err) {
        console.error('Error creating cart table:', err);
    } else {
        console.log('Cart table ready.');
    }
});

// Serve index.html for the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve signup.html
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// Serve signin.html
app.get('/signin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signin.html'));
});

// Serve other HTML pages with session check
const pages = ['shop.html', 'accs.html', 'buyget.html', 'ethnic.html', 'footwear.html', 'seasonal.html'];

pages.forEach(page => {
    app.get(`/${page}`, (req, res) => {
        if (req.session && req.session.user) {
            res.sendFile(path.join(__dirname, 'public', page));
        } else {
            res.redirect('/signin');
        }
    });
});

// Handle signup form submission
app.post('/signup', async (req, res) => {
    const { firstName, surName, email, password } = req.body;
    if (!firstName || !surName || !email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        // Check if the email is already registered
        const checkEmailQuery = 'SELECT * FROM users WHERE email = $1';
        const checkEmailResult = await db.query(checkEmailQuery, [email]);

        if (checkEmailResult.rows.length > 0) {
            return res.status(400).json({ error: 'Email is already registered.' });
        }

        // Insert new user
        const insertUserQuery = `
            INSERT INTO users (firstName, surName, email, password)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `;
        const insertUserResult = await db.query(insertUserQuery, [firstName, surName, email, password]);

        // Automatically sign in the user after signup
        req.session.user = {
            id: insertUserResult.rows[0].id,
            firstName,
            surName,
            email
        };

        res.status(200).json({ success: true });
    } catch (err) {
        console.error('Error during signup:', err.message); // Log only the message
        console.error('Stack trace:', err.stack); // Log the stack trace
        res.status(500).json({ error: 'Error during signup.' });
    }
});

// Handle signin form submission
app.post('/signin', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        // Query to check credentials
        const query = 'SELECT * FROM users WHERE email = $1 AND password = $2';
        const result = await db.query(query, [email, password]);

        if (result.rows.length > 0) {
            // Store user information in session
            req.session.user = {
                id: result.rows[0].id,
                firstName: result.rows[0].firstname,
                surName: result.rows[0].surname,
                email: result.rows[0].email
            };
            res.status(200).json({ success: true });
        } else {
            res.status(400).json({ error: 'Invalid email or password.' });
        }
    } catch (err) {
        console.error('Error checking credentials:', err.message);
        console.error('Stack trace:', err.stack);
        res.status(500).json({ error: 'Error checking credentials.' });
    }
});

// Handle sign out
app.post('/signout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error during sign out:', err);
            return res.status(500).json({ error: 'Error during sign out.' });
        }
        res.status(200).json({ success: true });
    });
});

// Route to get user information
// Get user information
app.get('/user-info', (req, res) => {
    if (req.session && req.session.user) {
        res.json({
            firstName: req.session.user.firstName,
            surName: req.session.user.surName,
            email: req.session.user.email
        });
    } else {
        res.status(401).json({ error: 'User not signed in' });
    }
});

// Handle adding item to cart
app.post('/add-to-cart', async (req, res) => {
    if (req.session && req.session.user) {
        const { productId, productName, productQuantity, price, pic, productSize } = req.body;
        if (productQuantity === undefined || productQuantity <= 0) {
            return res.status(400).json({ error: 'Invalid quantity provided.' });
        }

        const userEmail = req.session.user.email;

        // Query to insert into cart with PostgreSQL syntax
        const query = `
            INSERT INTO cart (email, product_id, product_name, product_quantity, price, pic, size)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (email, product_id)
            DO UPDATE SET product_quantity = cart.product_quantity + EXCLUDED.product_quantity;
        `;

        try {
            await db.query(query, [userEmail, productId, productName, productQuantity, price, pic, productSize]);
            res.status(200).json({ message: 'Product added to cart successfully' });
        } catch (err) {
            console.error('Failed to add to cart:', err);
            res.status(500).json({ error: 'Failed to add to cart' });
        }
    } else {
        res.status(401).json({ error: 'User not signed in' });
    }
});

// Handle fetching cart items
app.get('/cart-items', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'User not signed in' });
    }

    const userEmail = req.session.user.email; // Fetch the user's email from the session
    const query = 'SELECT * FROM cart WHERE email = $1'; // Query to select cart items based on email

    try {
        const { rows } = await db.query(query, [userEmail]);
        res.status(200).json({ items: rows });
    } catch (err) {
        console.error('Error fetching cart items:', err);
        res.status(500).json({ error: 'Error fetching cart items.' });
    }
});

// Handle updating cart
app.post('/update-cart', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'User not signed in' });
    }

    const { productId } = req.body;
    const userEmail = req.session.user.email;

    // Query to check the quantity of the item in the cart
    const checkQuantityQuery = `
        SELECT product_quantity FROM cart
        WHERE email = $1 AND product_id = $2
    `;

    try {
        const { rows } = await db.query(checkQuantityQuery, [userEmail, productId]);

        if (rows.length > 0) {
            const currentQuantity = rows[0].product_quantity;

            if (currentQuantity > 1) {
                // Update the quantity
                const updateQuantityQuery = `
                    UPDATE cart
                    SET product_quantity = product_quantity - 1
                    WHERE email = $1 AND product_id = $2
                `;

                await db.query(updateQuantityQuery, [userEmail, productId]);
                res.status(200).json({ success: true });
            } else {
                // Remove the item if quantity is 1
                const deleteItemQuery = `
                    DELETE FROM cart
                    WHERE email = $1 AND product_id = $2
                `;

                await db.query(deleteItemQuery, [userEmail, productId]);
                res.status(200).json({ success: true });
            }
        } else {
            res.status(404).json({ error: 'Item not found in cart' });
        }
    } catch (err) {
        console.error('Failed to update cart:', err);
        res.status(500).json({ error: 'Failed to update cart' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

