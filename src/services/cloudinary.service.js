import cloudinary from "../config/cloudinary.js";

const uploadBuffer = (
  buffer,
  options = {},
) =>
  new Promise(
    (resolve, reject) => {
      const stream =
        cloudinary.uploader.upload_stream(
          {
            resource_type: "image",

            type: "authenticated",

            folder:
              "liga-tenis-san-pedro/dni",

            ...options,
          },

          (
            error,
            result,
          ) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(result);
          },
        );

      stream.end(buffer);
    },
  );

export const uploadDniImages =
  async ({
    frontBuffer,
    backBuffer,
    userReference,
  }) => {
    const front =
      await uploadBuffer(
        frontBuffer,
        {
          public_id:
            `${userReference}-front-${Date.now()}`,
        },
      );

    const back =
      await uploadBuffer(
        backBuffer,
        {
          public_id:
            `${userReference}-back-${Date.now()}`,
        },
      );

    return {
      front,
      back,
    };
  };