const { Router } = require("express");
require("dotenv").config();
const imageRouter = Router();
const Image = require("../models/Image");
const { upload } = require("../middleware/imageUpload");
// const { ADMIN, ADMIN_ID } = process.env; //super //superadimn
const fs = require("fs"); //file system
const { promisify } = require("util");
const mongoose = require("mongoose");
const { s3, getSignedUrl } = require("../aws");
const { DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const { v4: uuid } = require("uuid");
const mime = require("mime-types");

imageRouter.post("/presigned", async (req, res) => {
  try {
    if (!req.user) throw new Error("권한이 없습니다.");
    const { contentTypes } = req.body;
    if (!Array.isArray(contentTypes)) throw new Error("invalid contentTypes");

    const presignedData = await Promise.all(
      contentTypes.map(async (contentType) => {

        const imageKey = `${uuid()}.${mime.extension(contentType)}`;
        const key = `raw/${imageKey}`;
        const presigned = await getSignedUrl({ key });

				// console.log(imageKey);
        return { imageKey, presigned };
      })
    );

    res.json(presignedData);
  } catch (err) {
    console.log(err);
    res.status(400).json({ message: err.message });
  }
});

// imageRouter.post("/", upload.array("image", 4), async (req, res) => {
// 	// DB저장, 유저정보 저장
// 	try {
// 		if(!req.user) throw new Error("권한이 없습니다."); //로그인 유무 확인
		
// 		const { images } = req.body;
// 		const firstImg = images[0].imageKey;
		
// 		// const imageDocs = await Promise.all(
// 		// 	images.map(
// 		// 		(image) => new Image({
// 		// 			user: {
// 		// 				_id: req.user.id,
// 		// 				name: req.user.name,
// 		// 				username: req.user.username,
// 		// 			},
// 		// 			key: firstImg, //업로드한 첫번쨰 이미지
// 		// 			details: {
// 		// 				key: image.imageKey,
// 		// 				filename: image.imageKey,
// 		// 				originalFileName: image.originalname,
// 		// 			}
// 		// 			// details: image.map((file) => ({
// 		// 			// 	key: file,
// 		// 			// 	filename: file,
// 		// 			// 	originalFileName: file.originalname,
// 		// 			// }))
// 		// 		})
// 		// 	)
// 		// );
// 		const test = req.files.map((file) => ({
// 			key: file.key.replace("raw/", ""),
// 			filename: file.key.replace("raw/", ""),
// 			originalFileName: file.originalname,
// 		}));

// 		const imageDocs = await Promise.all(
// 			test.map((image) =>
// 				new Image({
// 					user: {
// 						_id: req.user.id,
// 						name: req.user.name,
// 						username: req.user.username,
// 					},
// 					key: firstImg, // 업로드한 첫 번째 이미지
// 					details: [image],
// 				}).save()
// 			)
// 		);

// 		res.json(imageDocs);
// 	} catch (err) {
// 		console.log(err);
// 		res.status(400).json({ message: err.message });
// 	}
// });

imageRouter.post("/", upload.array("image", 4), async (req, res) => {
	// DB저장, 유저정보 저장
	try {
		if(!req.user) throw new Error("권한이 없습니다."); //로그인 유무 확인
		
		// if(req.user.username !== ADMIN && req.user.id !== ADMIN_ID)
		// 	throw new Error("권한이 없습니다."); //관리자만 업로드 가능
		
		const { images } = req.body;
		
		const image = await new Image({
			user: {
				_id: req.user.id,
				name: req.user.name,
				username: req.user.username,
			},
			key: images[0].imageKey, //업로드한 첫번쨰 이미지
			details: images.map((file) => ({
				key: file.imageKey,
				filename: file.imageKey,
				originalFileName: file.originalname,
			}))
		}).save();

		res.json(image);
	} catch (err) {
		console.log(err);
		res.status(400).json({ message: err.message });
	}
});

imageRouter.get("/", async (req, res) => {// DB에서 이미지 조회
	try {
		const { lastid } = req.query;

		if(lastid && !mongoose.isValidObjectId(lastid)) throw new Error("lastid 오류");

		const images = await Image.find(
			lastid && { _id: { $lt: lastid } }
		)
			.sort({ _id: -1 }) //리스트 업로드일자 역순(최근 업로드가 첫번째)
			.limit(4); //페이지당 리스트 총 갯수

		res.json(images);
	} catch (err) {
		console.log(err);
		res.status(400).json({ message: err.message });
	}
});

imageRouter.get("/:imageId", async (req, res) => { //상세페이지 이미지 DB 개별조회
	try {
		const { imageId } = req.params;
		if(!mongoose.isValidObjectId(imageId)) throw new Error("올바르지 않은 imageId 입니다.");

		const image = await Image.findOne({ _id: imageId });
		if(!image) throw new Error("해당 이미지는 존재하지 않습니다.");

		res.json(image);
	} catch (err) {
		console.log(err);
		res.status(400).json({ message: err.message });
	}
});

imageRouter.delete("/:imageId", async (req, res) => { // 사진삭제
	try {
		if(!req.user) throw new Error("권한이 없습니다."); //로그인 유무 확인
	
		// if((req.user.username !== ADMIN && req.user.id !== ADMIN_ID) || req.user.id !== ADMIN_ID)
		// 	throw new Error("권한이 없습니다."); //관리자, 게스트만 삭제 가능(삭제버튼 생성유무로 변경)

		if(!mongoose.isValidObjectId(req.params.imageId))
			throw new Error("올바르지 않은 이미지 입니다.");

		const image = await Image.findOneAndDelete({_id: req.params.imageId}); //삭제한 이미지 알아내기
		if(!image) return res.json({ message: "이미 삭제된 이미지 입니다." });

		if (image.details && image.details.length > 0) { //s3.raw 버킷에서 이미지 삭제하기 
			const command = new DeleteObjectsCommand({
				Bucket: "yongzin3",
				Delete: {
					Objects: image.details.map((k) => {
						return { Key: `raw/${k.key}` };
					}),
				},
			});

			try {
				const { Deleted } = await s3.send(command);
			} catch (err) {
				console.error(err);
			}
		}
		
		// await fileUnlink(`./uploads/${image.key}`) //package.json 기준으로 경로설정(uploads폴더 이미지 삭제)
		res.json({ message: "요청하신 이미지가 삭제되었습니다." });
	} catch (err) {
		console.log(err);
		res.status(400).json({ message: err.message });
	}
});

imageRouter.patch("/:imageId/like", async (req, res) => {// 좋아요 기능
	try {
		if(!req.user) throw new Error("권한이 없습니다."); //로그인 유무 확인
		if(!mongoose.isValidObjectId(req.params.imageId)) throw new Error("올바르지 않은 imageId 입니다.");

		const image = await Image.findByIdAndUpdate(
			{ _id: req.params.imageId },
			{ $addToSet: { likes: req.user.id } }, //addToSet 중복 않되는 아이디만 저장
			{ new: true }
		);

		res.json(image);
	} catch (err) {
		console.log(err);
		res.status(400).json({ message: err.message });
	}
});

imageRouter.patch("/:imageId/unlike", async (req, res) => {// 좋아요 취소
	try {
		if(!req.user) throw new Error("권한이 없습니다."); //로그인 유무 확인
		if(!mongoose.isValidObjectId(req.params.imageId)) throw new Error("올바르지 않은 imageId 입니다.");

		const image = await Image.findByIdAndUpdate(
			{ _id: req.params.imageId },
			{ $pull: { likes: req.user.id } }, 
			{ new: true }
		);

		res.json(image);
	} catch (err) {
		console.log(err);
		res.status(400).json({ message: err.message });
	}
});

module.exports = { imageRouter };