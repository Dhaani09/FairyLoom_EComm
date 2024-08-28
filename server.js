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
app.post('/signup', (req, res) => {
    const { firstName, surName, email, password } = req.body;
    if (!firstName || !surName || !email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    // Check if the email is already registered
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('Error checking for existing email:', err);
            return res.status(500).json({ error: 'Error checking for existing email.' });
        }

        if (results.length > 0) {
            return res.status(400).json({ error: 'Email is already registered.' });
        }

        // Insert new user
        const query = 'INSERT INTO users (firstName, surName, email, password) VALUES (?, ?, ?, ?)';
        db.query(query, [firstName, surName, email, password], (err, result) => {
            if (err) {
                console.error('Error saving user to database:', err);
                return res.status(500).json({ error: 'Error saving user to database.' });
            }

            // Automatically sign in the user after signup
            req.session.user = {
                id: result.insertId,
                firstName,
                surName,
                email
            };

            res.status(200).json({ success: true });
        });
    });
});

// Handle signin form submission
app.post('/signin', (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if (err) {
            console.error('Error checking credentials:', err);
            return res.status(500).json({ error: 'Error checking credentials.' });
        }

        if (results.length > 0) {
            // Store user information in session
            req.session.user = {
                id: results[0].id,
                firstName: results[0].firstName,
                surName: results[0].surName,
                email: results[0].email
            };
            res.status(200).json({ success: true });
        } else {
            res.status(400).json({ error: 'Invalid email or password.' });
        }
    });
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
app.post('/add-to-cart', (req, res) => {
    if (req.session && req.session.user) {
        const { productId, productName, productQuantity, price, pic, productSize} = req.body;
        if (productQuantity === undefined || productQuantity <= 0) {
            return res.status(400).json({ error: 'Invalid quantity provided.' });
        }

        const userEmail = req.session.user.email;

        // Database query to insert into cart
        const query = `
            INSERT INTO cart (email, product_id, product_name, product_quantity, price, pic, size)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE product_quantity = product_quantity + VALUES(product_quantity);
        `;

        // Assuming you are using a MySQL or SQLite database connection
        db.query(query, [userEmail, productId, productName, productQuantity, price, pic, productSize], function (err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to add to cart' });
            }
            res.status(200).json({ message: 'Product added to cart successfully' });
        });
    } else {
        res.status(401).json({ error: 'User not signed in' });
    }
});


// Handle fetching cart items
app.get('/cart-items', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'User not signed in' });
    }

    const userEmail = req.session.user.email; // Fetch the user's email from the session
    const query = 'SELECT * FROM cart WHERE email = ?'; // Query to select cart items based on email
    db.query(query, [userEmail], (err, results) => {
        if (err) {
            console.error('Error fetching cart items:', err);
            return res.status(500).json({ error: 'Error fetching cart items.' });
        }
        res.status(200).json({ items: results });
    });
});

// Handle clearing cart on sign out
// Endpoint to handle removal of cart items
app.post('/update-cart', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'User not signed in' });
    }

    const { productId } = req.body;
    const userEmail = req.session.user.email;

    // SQL query to decrease quantity or delete item if quantity becomes zero
    const checkQuantityQuery = `
        SELECT product_quantity FROM cart
        WHERE email = ? AND product_id = ?
    `;

    db.query(checkQuantityQuery, [userEmail, productId], (err, results) => {
        if (err) {
            console.error('Error fetching cart item quantity:', err);
            return res.status(500).json({ error: 'Failed to update cart' });
        }

        if (results.length > 0) {
            const currentQuantity = results[0].product_quantity;
            
            if (currentQuantity > 1) {
                // Update the quantity
                const updateQuantityQuery = `
                    UPDATE cart
                    SET product_quantity = product_quantity - 1
                    WHERE email = ? AND product_id = ?
                `;

                db.query(updateQuantityQuery, [userEmail, productId], (err) => {
                    if (err) {
                        console.error('Error updating cart quantity:', err);
                        return res.status(500).json({ error: 'Failed to update cart' });
                    }
                    res.status(200).json({ success: true });
                });
            } else {
                // Remove the item if quantity is 1
                const deleteItemQuery = `
                    DELETE FROM cart
                    WHERE email = ? AND product_id = ?
                `;

                db.query(deleteItemQuery, [userEmail, productId], (err) => {
                    if (err) {
                        console.error('Error removing item from cart:', err);
                        return res.status(500).json({ error: 'Failed to remove item from cart' });
                    }
                    res.status(200).json({ success: true });
                });
            }
        } else {
            res.status(404).json({ error: 'Item not found in cart' });
        }
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

