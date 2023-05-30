//유저 API
const { Router } = require("express");
const userRouter = Router();
const User = require("../models/User");
const { hash, compare } = require("bcryptjs"); //비밀번호 암호화
const Image = require("../models/Image");
const mongoose = require("mongoose");

userRouter.post("/register", async (req, res) => { //회원가입 API
	try {
		if(req.body.password.length < 6) throw new Error("비밀번호를 6자 이상으로 해주세요.");
		if(req.body.username.length < 3) throw new Error("아이디를 3글자 이상으로 해주세요.");

		const hashedPassword = await hash(req.body.password, 10); //비밀번호 암호화
		const user = await new User({
			name: req.body.name,
			username: req.body.username,
			hashedPassword,
			sessions: [{ createdAt: new Date() }]
		}).save();
		const session = user.sessions[0];
		res.json({
			message: "회원가입 성공",
			sessionId: session._id,
			name: user.name,
			userId: user._id
		});
	} catch (err) {
		console.log(err);
		res.status(400).json({ message: err.message });
	}
});

userRouter.patch("/login", async (req, res) => { //로그인 API
	try {
		const user = await User.findOne({ username: req.body.username });
		if(!user) throw new Error("입력하신 정보가 올바르지 않습니다.");
		const isValid = await compare(req.body.password, user.hashedPassword); //DB에서 비밀번호 비교
		if(!isValid) throw new Error("입력하신 정보가 올바르지 않습니다.");

		user.sessions.push({ createdAt: new Date() }); //회원가입 후 자동로그인
		const session = user.sessions[user.sessions.length - 1];
		await user.save();
		res.json({
			message: "로그인 성공",
			sessionId: session._id,
			name: user.name,
			userId: user._id
		});
	} catch (err) {
		console.log(err);
		res.status(400).json({ message: err.message });
	}
});

userRouter.patch("/logout", async (req, res) => { //로그아웃 API
	try {
		if(!req.user) throw new Error("로그인정보 오류");
		await User.updateOne( //로그아웃시 세션ID 삭제
			{ _id: req.user.id },
			{ $pull: { sessions: { _id: req.headers.sessionid } } } //배열 수정(세션ID 삭제)
		);
		res.json({message: "로그아웃"});
	} catch (err) {
		console.log(err);
		res.status(400).json({ message: err.message });
	}
});

userRouter.get("/me", (req, res) => { // 세션id를 가진 유저정보 불러오기
	try {
		// if(!req.user) throw new Error("권한이 없습니다."); //로그아웃시 콘솔 오류뜸
		if(!req.user) return;
		
		res.json({
			message: "성공",
			sessionId: req.headers.sessionid,
			name: req.user.name,
			userId: req.user._id
		});
	} catch (err) {
		console.log(err);
		res.status(400).json({ message: err.message });
	}
});

userRouter.get("/me/images", async (req, res) => {
	try {
		// if(!req.user) throw new Error("권한이 없습니다.");
		
		const images = await Image.find({ "user._id": req.user.id });
		
		res.json(images);
	} catch (err) {
		console.log(err);
		res.status(400).json({ message: err.message });
	}
})

module.exports = { userRouter };