import multer from "multer";

const storage =
  multer.memoryStorage();

const fileFilter = (
  _req,
  file,
  cb,
) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (
    !allowedTypes.includes(
      file.mimetype,
    )
  ) {
    return cb(
      new Error(
        "Las fotos del DNI deben ser JPG, PNG o WEBP",
      ),
    );
  }

  cb(null, true);
};

export const uploadDni =
  multer({
    storage,

    fileFilter,

    limits: {
      fileSize:
        5 * 1024 * 1024,
    },
  }).fields([
    {
      name: "dni_front",
      maxCount: 1,
    },
    {
      name: "dni_back",
      maxCount: 1,
    },
  ]);