import multer from "multer";
import path from "path";
import fs from "fs";

const dir = path.resolve("uploads/dni");
fs.mkdirSync(dir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("Las fotos del DNI deben ser imágenes"));
  }
  cb(null, true);
};

export const uploadDni = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).fields([
  { name: "dni_front", maxCount: 1 },
  { name: "dni_back", maxCount: 1 },
]);
