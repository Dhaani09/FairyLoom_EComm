window.onload = function () {
    fetch('/user-info')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                // No user signed in
                document.getElementById('profile-pic').src = 'images/p1.jpg';
                document.getElementById('user-info').innerHTML = `
                    <p><a href="signin.html">Sign In</a> | <a href="signup.html">Sign Up</a></p>
                `;
                document.getElementById('sign-out').style.display = 'none';
            } 
            else {
                // User signed in
                document.getElementById('profile-pic').src = 'images/p2.jpg'; // Replace with actual image path for signed-in users
                document.getElementById('user-info').innerHTML = `
                    <p style="text-decoration:underline;">Name:</p><p style="font-weight: bold"> ${data.firstName} ${data.surName}</p>
                    <p style="text-decoration:underline;">Email:</p><p style="font-weight: bold"> ${data.email}</p>
                `;
                document.getElementById('sign-out').style.display = 'block'; // Show the Sign Out button

                fetchCartItems();

                document.getElementById('sign-out').onclick = function () {
                    fetch('/signout', { method: 'POST' })
                        .then(response => response.json())
                        .then(result => {
                            if (result.success) {
                                fetch('/clear-cart', { method: 'POST' }) // Clear cart on sign out
                                    .then(() => window.location.reload());
                            } else {
                                alert('Error signing out.');
                            }
                        })
                        .catch(error => {
                            console.error('Error during sign out:', error);
                            alert('An error occurred during sign out.');
                        });
                };
            }
        })
        .catch(error => console.error('Error fetching user info:', error));
    
    // Add to cart functionality
    document.querySelectorAll('.add-to-cart').forEach(button => {
        button.addEventListener('click', function (event) {
            event.preventDefault();
            const product = this.closest('.pro');
            const productId = product.dataset.id;
            const productName = product.dataset.name;
            const price = product.dataset.price;
            const productSize = product.querySelector('.size').value;
            const quantity = product.querySelector('.quantity').value;
            
            fetch('/add-to-cart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId, productName, productSize, price, quantity })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Item added to cart');
                }
            })
        });
    });
};

// Function to add item to the cart
document.addEventListener('DOMContentLoaded', () => {
    const addToCartButtons = document.querySelectorAll('.add-to-cart');

    addToCartButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            event.preventDefault(); // Prevent the default anchor action

            const productDiv = button.closest('.pro');
            const productId = productDiv.getAttribute('data-id');
            const productName = productDiv.getAttribute('data-name');
            const productSize = productDiv.querySelector('.size').value;
            const quantity = productDiv.querySelector('.quantity').value;
            const price = productDiv.getAttribute('data-price');
            const pic = productDiv.getAttribute('data-pic');

            // Call the addToCart function
            addToCart(productId, productName, productSize, quantity, price, pic);
        });
    });
});

function addToCart(productId, productName, productSize, productQuantity, price, pic) {
    fetch('/add-to-cart', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            productId: productId,
            productName: productName,
            productSize: productSize,
            productQuantity: productQuantity,
            price: price,
            pic: pic
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
        } else {
            alert(data.message);
            fetchCartItems();
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
}
function fetchCartItems() {
    fetch('/cart-items')
        .then(response => response.json())
        .then(data => {
            if (data.items && data.items.length > 0) {
                let cartItemsHtml = '';
                let grandTotal = 0; // Variable to store the sum of all item totals
                const itemCount = data.items.length; // Number of items in the cart

                data.items.forEach(item => {
                    const price = item.price; // Function to fetch price
                    const totalPrice = price * item.product_quantity;

                    // Add the total price of the current item to the grand total
                    grandTotal += totalPrice;

                    cartItemsHtml += `
                        <div class="cart-item" data-id="${item.product_id}" style="display: flex; align-items: center; margin-bottom: 20px;">
                            <div style="flex-shrink: 0; margin-right: 90px; margin-top: 80px;">
                                <img src="${item.pic}" alt="${item.product_name}" style="max-width: 200px; border-radius: 8px;">
                            </div>
                            <div style="margin-left: 120px; padding-top: 55px;" >
                                <p style="font-size: 18px; font-weight: bold;">${item.product_name}</p>
                                <p style="font-size: 18px;">Size: ${item.size}</p>
                                <p style="font-size: 18px;">Quantity: ${item.product_quantity}</p>
                                <p style="font-size: 18px;">Price: $${price}</p>
                                <p style="font-size: 18px; font-weight: bold;">Total Price: $${totalPrice}</p>
                                <button class="remove-from-cart" data-id="${item.product_id}" style="padding: 10px 15px; background-color: #ff4d4d; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">
                                    Remove from Cart
                                </button>
                            </div>
                        </div>
                    `;
                });

                // Add the grand total and "Proceed to buy" button to the end of the cart items HTML
                cartItemsHtml += `
                    <div style="text-align: center; padding-left: 180px; margin-top: 90px;">
                        <p style="font-size: 20px; font-weight: bold;">Grand Total: $${grandTotal.toFixed(2)}</p>    
                        <button id="proceed-to-buy" style="padding: 15px 20px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 18px; margin-top: 10px;">
                            Proceed to Buy (${itemCount} ${itemCount === 1 ? 'item' : 'items'})
                        </button>
                    </div>
                `;

                document.getElementById('cart-items').innerHTML = cartItemsHtml;

                // Add event listeners for remove buttons
                document.querySelectorAll('.remove-from-cart').forEach(button => {
                    button.addEventListener('click', function () {
                        const productId = this.getAttribute('data-id');
                        removeFromCart(productId);
                    });
                });

               
                // Add event listener for "Proceed to Buy" button
                document.getElementById('proceed-to-buy').addEventListener('click', function () {
                    redirectToPayment();
                });

            } else {
                document.getElementById('cart-items').innerHTML = '<p style="margin: 50px 440px; align-text: center; font-weight: bold;">Your cart is empty.</p>';
            }
        })
        .catch(error => console.error('Error fetching cart items:', error));
}

// Function to handle redirection to payment options
function redirectToPayment(productId = null) {
    if (productId) {
        // Redirect to payment page for a specific product
        window.location.href = `payment.html?product_id=${productId}`;
    } else {
        // Redirect to payment page for all items in the cart
        window.location.href = `payment.html`;
    }
}

function removeFromCart(productId) {
    fetch('/update-cart', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productId }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update UI
            fetchCartItems(); // Refresh cart items
        } else {
            alert('Error updating cart.');
        }
    })
    .catch(error => console.error('Error updating cart:', error));
}
