import express from "express";
import pg from "pg";
import jsSHA from "jssha";
import methodOverride from "method-override";
import cookieParser from "cookie-parser";
import axios from "axios";

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
app.use(methodOverride("_method"));
app.use(cookieParser());

/********
 **ROUTE**
 *********/

// Render the login page
const login = (req, res) => {
  res.render("login");
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
    response.cookie("userName", user.email);
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
  const sqlQuery =
    "SELECT c.category_name, p.product_name, p.price, p.summary FROM products AS p INNER JOIN category AS c ON c.id = p.category_id;";
  pool.query(sqlQuery, (err, result) => {
    if (err) {
      console.log("error", err);
      res.status(500).send(err);
    } else {
      let itemNames = result.rows;
      console.log(result.rows);
      res.render("home", { itemNames });
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
      res.render("item", { itemDetails });
    }
  });
};

//categories page load
const categoriesPage = (req, res) => {
  const { id } = req.params;
  if (id != 1) {
    const sqlQuery = `SELECT * FROM products AS p INNER JOIN category AS c ON c.id = p.category_id WHERE c.id = $1;`;

    pool.query(sqlQuery, [id], (err, result) => {
      if (err) {
        console.log("error", err);
        res.status(500).send(err);
      } else {
        // const sqlQuery2 =
        const categories = result.rows;
        console.log(categories);
        res.render("categories", { categories });
      }
    });
  } else {
    const sqlQuery = `SELECT * FROM products AS p INNER JOIN category AS c ON c.id = p.category_id WHERE p.is_hot = TRUE;`;

    pool.query(sqlQuery, (err, result) => {
      if (err) {
        console.log("error", err);
        res.status(500).send(err);
      } else {
        // const sqlQuery2 =
        const categories = result.rows;
        console.log(categories);
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

  console.log("obj product", objProductID);
  console.log("productid values", productID);
  console.log("productid type", typeof productID);
  console.log("userid", userID);

  const sqlQuery =
    `SELECT o.id AS oid, users.id AS uid, o.status FROM orders AS o INNER JOIN users ON users.id = o.user_id WHERE o.status = 'cart' AND o.user_id = ${userID}`;
  const sqlQuery2 =
    "INSERT INTO orders (user_id, status)VALUES ($1, $2) RETURNING *";
  const sqlQuery3 =
    "INSERT INTO orders_products (product_id, order_id, quantity) VALUES ($1, $2, $3) RETURNING *";

  pool.query(sqlQuery, (err, result) => {
    if (err) {
      console.log("error", err);
      res.status(500).send(err);
    } else {
      console.log("this is running")
      if (result.rows.length === 0) {
        pool.query(sqlQuery2, [userID, "cart"], (err, result) => {
          let orderID = result.rows[0].id;
          console.log("results row", result.rows.length);
          if (err) {
            console.log("error", err);
            res.status(500).send(err);
          } else {
            console.log("Success", result);
            pool.query(sqlQuery3, [productID, orderID, 1], (err, result) => {
              if (err) {
                console.log("error", err);
                res.status(500).send(err);
              } else {
                console.log("Success", result);
              }
            });
          }
        });
      } else {
      let orderID = result.rows[0].oid;
      console.log("orderID", orderID);
      pool.query(sqlQuery3, [productID, orderID, 1], (err, result) => {
        if (err) {
          console.log("error", err);
          res.status(500).send(err);
        } else {
          console.log("Success", result);
        }
      });
    }
    }
  });
};

app.get("/", home);
app.get("/item/:id", itemPage);
app.post("/item/:id", addItem);
app.get("/categories/:id", categoriesPage);
app.get("/login", login);
app.post("/login", loginAuth);
app.get("/signup", signUp);
app.post("/signup", createNewUser);
app.listen(3004);
