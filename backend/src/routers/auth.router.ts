import { Router } from 'express';
import AuthController from '../controllers/auth.controller';
import authenticate from '../middleware/auth.middleware';

const router = Router();
const controller = new AuthController();

router.post('/register', controller.register.bind(controller));
router.post('/login', controller.login.bind(controller));
router.post('/refresh-token', controller.refreshToken.bind(controller));
router.post('/logout', controller.logout.bind(controller));
router.post('/forgot-password', controller.forgotPassword.bind(controller));
router.post('/reset-password', controller.resetPassword.bind(controller));
router.post('/verify-email', controller.verifyEmail.bind(controller));
router.post('/send-verification', authenticate, controller.sendVerification.bind(controller));

export default router;