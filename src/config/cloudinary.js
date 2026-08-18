import { v2 as cloudinary } from "cloudinary";

/*
  Cloudinary detecta automáticamente
  CLOUDINARY_URL desde process.env.

  Formato esperado:

  cloudinary://API_KEY:API_SECRET@CLOUD_NAME
*/

if (!process.env.CLOUDINARY_URL) {
  throw new Error(
    "Falta CLOUDINARY_URL en el archivo .env",
  );
}

cloudinary.config({
  secure: true,
});

export default cloudinary;