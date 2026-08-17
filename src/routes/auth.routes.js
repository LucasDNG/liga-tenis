import { Router } from "express";
import {
  signUp,
  signIn,
  signOut,
  profile,
  chooseLeague,
} from "../controllers/auth.controllers.js";
import { isAuth } from "../middlewares/auth.middleware.js";
import { uploadDni } from "../middlewares/upload.middleware.js";

const router = Router();

router.post("/signup", uploadDni, signUp);
router.post("/signin", signIn);
router.post("/signout", signOut);
router.get("/profile", isAuth, profile);
router.patch("/profile/league", isAuth, chooseLeague);

export default router;
