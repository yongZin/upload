require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const { imageRouter } = require("./routes/imageRouter");
const { userRouter } = require("./routes/userRouter");
const app = express();
const { MONGO_URI, PORT } = process.env;
const {authentication} = require("./middleware/authentication");

mongoose // DB 연결
  .connect(MONGO_URI) //.env에 환경변수 설정
  .then(() => {
    console.log("MongoDB Connect.");

    app.use(express.static("build"));
    app.get("/", (req, res) => {
      res.sendFile(__dirname + "/build/index.html");
    })

    // app.use("/uploads", express.static("uploads")); //url 경로
    app.use(express.json()); //req.body를 json형식으로 변경
    app.use(authentication); //인증 미들웨어
    app.use("/images", imageRouter); // "images"가 들어가면 imageRouter실행
    app.use("/users", userRouter); // "users"가 들어가면 userRouter실행

    app.listen(PORT, () => console.log("PORT: " + PORT));
  })
  .catch((err) => console.log(err));
  // admin
  // wa9xaBDs3PyVWMbZ
  