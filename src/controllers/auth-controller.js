import "dotenv/config";
import authService from "../services/auth-service.js";

const registerCashier = async (req, res, next) => {
  const request = req.body;
  const protocol = req.protocol;
  const host = req.get("host");
  try {
    const response = await authService.registerCashier(request, protocol, host);
    res.status(201).json({
      status: 201,
      message:
        "Cashier created successfully, please check your email for activation your account",
      data: response,
    });
  } catch (error) {
    const status = error.status || 500;
    next(res.status(status).json({ status: status, message: error.message }));
  }
};

const loginCashier = async (req, res, next) => {
  try {
    const response = await authService.loginCashier(req.body);

    res.cookie("refreshToken", response.refreshToken, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === "production",
    });

    res.status(200).json({
      status: 200,
      message: "Cashier logged in successfully",
      data: {
        username: response.username,
        accessToken: response.accessToken,
        roles: response.roles,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    next(res.status(status).json({ status: status, message: error.message }));
  }
};

const registerAdmin = async (req, res, next) => {
  const request = req.body;
  const protocol = req.protocol;
  const host = req.get("host");
  try {
    const response = await authService.registerAdmin(request, protocol, host);

    res.status(201).json({
      status: 201,
      message:
        "Admin created successfully, please check your email for activation your account",
      data: response,
    });
  } catch (error) {
    const status = error.status || 500;
    next(res.status(status).json({ status: status, message: error.message }));
  }
};

const loginAdmin = async (req, res, next) => {
  try {
    const response = await authService.loginAdmin(req.body);

    res.cookie("refreshToken", response.refreshToken, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === "production",
    });

    res.status(200).json({
      status: 200,
      message: "Admin logged in successfully",
      data: {
        username: response.username,
        accessToken: response.accessToken,
        roles: response.roles,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    next(res.status(status).json({ status: status, message: error.message }));
  }
};

const activateAccount = async (req, res, next) => {
  try {
    const response = await authService.activateAccount(req.params.token);
    res.status(200).json({
      status: 200,
      message: "Account activated successfully",
      data: response,
    });
  } catch (error) {
    const status = error.status || 500;
    next(res.status(status).json({ status: status, message: error.message }));
  }
};

const forgetPassword = async (req, res, next) => {
  const request = req.body;
  const protocol = req.protocol;
  const host = req.get("host");
  try {
    await authService.forgetPassword(request, protocol, host);
    res.status(200).json({
      status: 200,
      message: "Password reset link sent to your email",
    });
  } catch (error) {
    const status = error.status || 500;
    next(res.status(status).json({ status: status, message: error.message }));
  }
};

const getResetPassword = async (req, res, next) => {
  const { id, token } = req.params;
  try {
    const response = await authService.getResetPassword(id, token);
    res.status(200).json({
      status: 200,
      message: "Success to get reset password link",
      data: response,
    });
  } catch (error) {
    const status = error.status || 500;
    next(res.status(status).json({ status: status, message: error.message }));
  }
};

const resetPassword = async (req, res, next) => {
  const token = req.query.token;
  const request = req.body;
  try {
    const response = await authService.resetPassword(request, token);
    res.status(200).json({
      status: 200,
      message: "Password changed successfully",
      data: response,
    });
  } catch (error) {
    const status = error.status || 500;
    next(res.status(status).json({ status: status, message: error.message }));
  }
};

const changePassword = async (req, res, next) => {
  const request = req.body;
  try {
    const response = await authService.changePassword(request);
    res.status(200).json({
      status: 200,
      message: "Password changed successfully",
      data: response,
    });
  } catch (error) {
    const status = error.status || 500;
    next(res.status(status).json({ status: status, message: error.message }));
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const response = await authService.refreshToken(req.cookies.refreshToken);

    res.status(200).json({
      status: 200,
      message: "Token refreshed successfully",
      data: {
        accessToken: response.accessToken,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    next(res.status(status).json({ status: status, message: error.message }));
  }
};

const logout = async (req, res, next) => {
  try {
    await authService.logout(req.cookies.refreshToken);

    res.clearCookie("refreshToken");

    res.status(200).json({
      status: 200,
      message: "logged out successfully",
    });
  } catch (error) {
    const status = error.status || 500;
    next(res.status(status).json({ status: status, message: error.message }));
  }
};

export default {
  registerCashier,
  activateAccount,
  loginCashier,
  registerAdmin,
  loginAdmin,
  forgetPassword,
  getResetPassword,
  resetPassword,
  refreshToken,
  changePassword,
  logout,
};
