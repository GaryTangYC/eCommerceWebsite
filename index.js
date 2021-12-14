import express from "express";
import pg from "pg";
import jsSHA from "jssha";
import methodOverride from "method-override";
import cookieParser from "cookie-parser";
import path from "path";
const __dirname = path.resolve();
// import axios from "axios";

// Initialise DB connection
const { Pool } = pg;
const pgConnectionConfigs = {
  user: "yctang",
  host: "localhost",
  database: "commerce",
  port: 5432, // Postgres server always runs on this port by default
};
const pool = new Pool(pgConnectionConfigs);

const app = express();
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "/public")));
app.use(express.static(path.join(__dirname, "/views")));
app.use(methodOverride("_method"));
app.use(cookieParser());

app.use((req, res, next) => {
  req.isUserLoggedIn = false;

  if (req.cookies.loggedIn && req.cookies.userID) {
    req.isUserLoggedIn = true;
  }
  next();
});

/********
 **ROUTE**
 *********/

// Render the login page
const login = (req, res) => {
  if (!req.cookies.loggedIn)
    res.render("login", { page: "/login", loggedOut: true });
  else res.redirect("/");
};

// Login authentication based on login data
const loginAuth = (request, response) => {
  const values = [request.body.email];
  pool.query("SELECT * from users WHERE email=$1", values, (error, result) => {
    if (error) {
      console.log("Error executing query", error.stack);
      response.status(503).send(result.rows);
      return;
    }
    if (result.rows.length === 0) {
      response.status(403).send("login failed1!");
      return;
    }
    const user = result.rows[0];
    const shaObj = new jsSHA("SHA-512", "TEXT", { encoding: "UTF8" });
    shaObj.update(request.body.password);

    const hashedPassword = shaObj.getHash("HEX");
    console.log(user.password);
    console.log(hashedPassword);
    if (user.password !== hashedPassword) {
      response.status(403).send("login failed!2");
      return;
    }
    response.cookie("loggedIn", true);
    response.cookie("userEmail", user.email);
    response.cookie("userID", user.id);
    response.redirect("/");
  });
};

// Render the signup page
const signUp = (req, res) => {
  res.render("signup");
};

// Create new user from form data
const createNewUser = (req, res) => {
  const shaObj = new jsSHA("SHA-512", "TEXT", { encoding: "UTF8" });
  shaObj.update(req.body.password);
  const password = shaObj.getHash("HEX");

  const values = Object.values(req.body);
  console.log("before splice", values);
  values.splice(1, 1, password);
  console.log("after splice", values);

  // formData.push(hashedPassword);
  const sqlQuery =
    "INSERT INTO users (email, password, first_name, last_name, user_address, contact) VALUES($1, $2, $3, $4, $5, $6) RETURNING *";

  pool.query(sqlQuery, values, (err, result) => {
    if (err) {
      console.log("error", err);
      res.status(500).send(err);
    } else {
      res.redirect("/");
    }
  });
};

//Home page load
const home = (req, res) => {
  console.log("cookies", req.cookies);

  const sqlQuery =
    "SELECT p.id, c.category_name, p.product_name, p.price, p.summary FROM products AS p INNER JOIN category AS c ON c.id = p.category_id ORDER BY c.category_name ASC;";
  pool.query(sqlQuery, (err, result) => {
    if (err) {
      console.log("error", err);
      res.status(500).send(err);
    } else {
      let itemNames = result.rows;
      console.log(result.rows);
      res.render("home", { itemNames, isUserLoggedIn: req.isUserLoggedIn });
    }
  });
};

//item page load
const itemPage = (req, res) => {
  const { id } = req.params;
  const sqlQuery = "SELECT * FROM products WHERE id = $1";
  pool.query(sqlQuery, [id], (err, result) => {
    if (err) {
      console.log("error", err);
      res.status(500).send(err);
    } else {
      const itemDetails = result.rows;
      console.log(itemDetails);
      res.render("item", { itemDetails, isUserLoggedIn: req.isUserLoggedIn });
    }
  });
};

//categories page load
const categoriesPage = (req, res) => {
  const { id } = req.params;
  if (id != 1) {
    const sqlQuery = `SELECT p.*, c.id AS cat_ID FROM products AS p INNER JOIN category AS c ON c.id = p.category_id WHERE c.id = $1;`;

    pool.query(sqlQuery, [id], (err, result) => {
      if (err) {
        console.log("error", err);
        res.status(500).send(err);
      } else {
        const categories = result.rows;
        console.log(categories);
        res.render("categories", {
          categories,
          isUserLoggedIn: req.isUserLoggedIn,
        });
      }
    });
  } else {
    const sqlQuery =
      "SELECT p.* FROM products AS p INNER JOIN category AS c ON c.id = p.category_id WHERE p.is_hot = TRUE;";

    pool.query(sqlQuery, (err, result) => {
      if (err) {
        res.status(500).send(err);
      } else {
        // const sqlQuery2 =
        const categories = result.rows;
        categories.forEach(function (obj) {
          if (obj.is_hot === true) {
            obj.category_name = "HOT ITEMS";
          }
        });
        res.render("categories", { categories });
      }
    });
  }
};

// Add item to cart
const addItem = (req, res) => {
  const objProductID = Object.values(req.body);
  const productID = Number(objProductID);
  const userID = req.cookies.userID;

  const sqlQuery = `SELECT o.id AS oid, users.id AS uid, o.status FROM orders AS o INNER JOIN users ON users.id = o.user_id WHERE o.status = 'cart' AND o.user_id = ${userID}`;
  const sqlQuery2 =
    "INSERT INTO orders (user_id, status) VALUES ($1, $2) RETURNING *";
  const sqlQuery3 =
    "INSERT INTO orders_products (product_id, order_id, quantity) VALUES ($1, $2, $3) RETURNING *";

  pool.query(sqlQuery, (err, result) => {
    if (err) {
      console.log("error", err);
      result.status(500).send(err);
    } else {
      if (result.rows.length === 0) {
        pool.query(sqlQuery2, [userID, "cart"], (err, result) => {
          let orderID = result.rows[0].id;
          if (err) {
            result.status(500).send(err);
          } else {

            pool.query(sqlQuery3, [productID, orderID, 1], (err, result) => {
              if (err) { 
                res.status(500).send(err);
              } return res.json({ success: true });
            });
          }
        });
      } else {
        let orderID = result.rows[0].oid;
        console.log("orderID", orderID);
        pool.query(sqlQuery3, [productID, orderID, 1], (err, result) => {
          if (err) {
            console.log("error", err);
            result.status(500).send(err);
          } else {
            console.log("Item added success");
          }
        });
      }
    }
  });
};

const logoutUser = (req, res) => {
  if (req.cookies.loggedIn === "true") {
    res.clearCookie("userID");
    res.clearCookie("userEmail");
    res.clearCookie("loggedIn");
  }
  res.redirect("/");
};

const testFn = (req, res) => {
  const { id } = req.params;
  const sqlQuery = "SELECT * FROM products WHERE id = $1";
  pool.query(sqlQuery, [id], (err, result) => {
    if (err) {
      console.log("error", err);
      res.status(500).send(err);
    } else {
      const itemDetails = result.rows;
      console.log(itemDetails);
      res.render("test", { itemDetails });
    }
  });
};

// cart page load
const cartPage = (req, res) => {
  console.log("req.cookies", req.cookies);
  if (req.cookies.loggedIn === undefined) {
    res.redirect("/login");
  } else {
    const userID = req.cookies.userID;
    const sqlQuery = `SELECT o.id AS oid, o.user_id AS uid, o.status, orders_products.product_id, products.* FROM orders AS o INNER JOIN orders_products ON orders_products.order_id = o.id  INNER JOIN products on products.id = orders_products.product_id WHERE o.status = 'cart' AND o.user_id = ${userID}`;

    pool.query(sqlQuery, (err, result) => {
      if (err) {
        console.log("error", err);
        res.status(500).send(err);
      } else {
        if (result.rows.length === 0) {
          res.render("cartEmpty");
        } else {
          const cartDetails = result.rows;
          console.log(cartDetails);
          res.render("cart", { cartDetails });
        }
      }
    });
  }
};

const finalizeCart = (req, res) => {
  const objOrderID = Object.values(req.body);
  const orderID = Number(objOrderID);
  const userID = req.cookies.userID;

  console.log("orderID", orderID);
  console.log("orderID type", typeof orderID);
  console.log("userID", userID);
  console.log("userID type", typeof userID);

  const sqlQuery = `UPDATE orders SET status = 'complete' WHERE orders.id = ${orderID};`;

  pool.query(sqlQuery, (err, result) => {
    if (err) {
      console.log("error", err);
      res.status(500).send(err);
    } else {
      res.redirect("/");
    }
  });
};

// profile page load
const profilePage = (req, res) => {
  console.log("req.cookies", req.cookies);
  if (req.cookies.loggedIn === undefined) {
    res.redirect("/login");
  } else {
    const userID = req.cookies.userID;
    const sqlQuery = `SELECT o.id AS orderID, o.status, p.product_name, p.price FROM orders AS o INNER JOIN orders_products AS o_p ON o.id = o_p.order_id INNER JOIN products as p on o_p.product_id = p.id WHERE o.user_id = ${userID} ORDER BY o.status ASC, orderID DESC;`;

    pool.query(sqlQuery, (err, result) => {
      if (err) {
        console.log("error", err);
        res.status(500).send(err);
      } else {
        const orderDetails = result.rows;
        console.log(orderDetails);
        res.render("profile", { orderDetails });
      }
    });
  }
};

app.get("/test/:id", testFn);
app.get("/", home);
app.get("/item/:id", itemPage);
app.post("/item/:id", addItem);
app.get("/categories/:id", categoriesPage);
app.get("/login", login);
app.get("/logout", logoutUser);
app.post("/login", loginAuth);
app.get("/signup", signUp);
app.post("/signup", createNewUser);
app.get("/cart", cartPage);
app.post("/cart", finalizeCart);
app.get("/profile", profilePage);

app.listen(3004);
