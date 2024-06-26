import {
  changePasswordSchemaRequest,
  forgetPasswordSchemaRequest,
  loginAdminSchemaRequest,
  loginCashierSchemaRequest,
  newAuthAdminSchemaRequest,
  newAuthCashierSchemaRequest,
  resetPasswordSchemaRequest,
} from "../dto/request/auth-request.js";
import { validate } from "../utils/validation-util.js";
import db from "../configs/database.js";
import { v4 as uuid } from "uuid";
import { ResponseError } from "../errors/response-error.js";
import bcrypt from "bcrypt";
import roleService from "./role-service.js";
import cashierService from "./cashier-service.js";
import jwt from "jsonwebtoken";
import "dotenv/config";
import adminService from "./admin-service.js";
import {
  sendEmailForgotPassword,
  sendEmailRegistration,
} from "../utils/email-util.js";
import { request } from "express";

const registerCashier = async (request, protocol, host) => {
  // TODO intialize transaction
  let transaction;

  try {
    // TODO start transaction
    transaction = await db.transaction();

    // TODO validate request
    const registerCashierRequest = validate(
      newAuthCashierSchemaRequest,
      request
    );

    if (
      registerCashierRequest.password !== registerCashierRequest.confirmPassword
    ) {
      throw new ResponseError(400, "Passwords do not match");
    }

    // TODO get user by username
    const existingUser = await db.models.userCredentials.findOne({
      where: {
        username: registerCashierRequest.username,
      },
      transaction,
    });

    if (existingUser) {
      throw new ResponseError(409, "User already exists");
    }

    // TODO hash password
    const hashedPassword = await bcrypt.hash(
      registerCashierRequest.password,
      10
    );

    // TODO create user credential
    const userCredential = await db.models.userCredentials.create(
      {
        id: uuid().toString(),
        username: registerCashierRequest.username,
        email: registerCashierRequest.email,
        password: hashedPassword,
        created_at: new Date(),
      },
      { transaction }
    );

    // TODO get role by role name
    const role = await roleService.getByRoleName("CASHIER", transaction);

    // TODO create user role
    await db.models.user_roles.create(
      {
        user_id: userCredential.id,
        role_id: role.id,
        created_at: new Date(),
      },
      { transaction }
    );

    // TODO get cashier by phone number
    const existingCashier = await cashierService.getByPhoneNumber(
      registerCashierRequest.phoneNumber,
      transaction
    );

    if (existingCashier) {
      throw new ResponseError(409, "Cashier already exists");
    }

    // TODO create cashier
    const cashier = {
      id: uuid().toString(),
      fullName: registerCashierRequest.fullName,
      callName: registerCashierRequest.callName,
      phoneNumber: registerCashierRequest.phoneNumber,
      street: registerCashierRequest.street,
      city: registerCashierRequest.city,
      province: registerCashierRequest.province,
      country: registerCashierRequest.country,
      userId: userCredential.id,
      postalCode: registerCashierRequest.postalCode,
      createdAt: new Date(),
    };

    const createdCashier = await cashierService.create(cashier, transaction);

    // TODO generate token
    const token = jwt.sign(
      {
        id: userCredential.id,
        username: userCredential.username,
        email: userCredential.email,
        role: role.role,
      },
      process.env.EMAIL_JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "7d",
        subject: userCredential.username,
      }
    );

    const link = `${protocol}://${host}/api/v1/auth/activate-account/${token}`;

    // TODO send email
    await sendEmailRegistration(
      userCredential.email,
      "Please activate your account",
      link
    );

    await transaction.commit();

    return toRegisterCashierResponse(createdCashier, userCredential, role);
  } catch (error) {
    if (transaction) {
      transaction.rollback();
    }

    throw new ResponseError(error.status, error.message);
  }
};

const loginCashier = async (request) => {
  // TODO intialize transaction
  let transaction;

  try {
    // TODO start transaction
    transaction = await db.transaction();

    // TODO validate request
    const loginCashierRequest = validate(loginCashierSchemaRequest, request);

    // TODO get user by username
    const userCredential = await db.models.userCredentials.findOne(
      {
        where: {
          username: loginCashierRequest.username,
        },
      },
      transaction
    );

    if (!userCredential) {
      throw new ResponseError(404, "User not found");
    } else if (!userCredential.activated) {
      throw new ResponseError(
        401,
        "Cashier not activated, please check your email"
      );
    }

    // TODO compare password
    const isPasswordValid = await bcrypt.compare(
      loginCashierRequest.password,
      userCredential.password
    );

    if (!isPasswordValid) {
      throw new ResponseError(401, "Authentication failed");
    }

    // TODO initialize authorities
    let authorities = [];

    // TODO get user roles
    const roles = await userCredential.getUserRoles();

    console.log("roles = {}", roles);

    // TODO get role
    const role = roles.find((role) => role.role === "CASHIER");

    console.log("role = {}", role);

    // TODO add role to authorities
    authorities.push(role.role.toUpperCase());

    if (!role.role) {
      throw new ResponseError(
        401,
        "Authentication failed for role: " + role.role
      );
    }

    // TODO create access token
    const accessToken = jwt.sign(
      {
        id: userCredential.id,
        username: userCredential.username,
        email: userCredential.email,
        role: role.role,
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: process.env.JWT_EXPIRES_IN,
        subject: userCredential.username,
      }
    );

    // TODO create refresh token
    const resfreshToken = jwt.sign(
      {
        id: userCredential.id,
        username: userCredential.username,
        email: userCredential.email,
        role: role.role,
      },
      process.env.JWT_REFRESH_SECRET,
      {
        algorithm: "HS256",
        expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN,
        subject: userCredential.username,
      }
    );

    // TODO update user credentials with refresh token
    await db.models.userCredentials.update(
      {
        refresh_token: resfreshToken,
        updated_at: new Date(),
      },
      {
        where: {
          id: userCredential.id,
        },
      },
      transaction
    );

    // TODO commit transaction
    await transaction.commit();

    // TODO return response
    return {
      username: userCredential.username,
      accessToken: accessToken,
      refreshToken: resfreshToken,
      roles: authorities,
    };
  } catch (error) {
    if (transaction) {
      transaction.rollback();
    }

    throw new ResponseError(error.status, error.message);
  }
};

const registerAdmin = async (request, protocol, host) => {
  // TODO intialize transaction
  let transaction;

  try {
    // TODO start transaction
    transaction = await db.transaction();

    // TODO validate request
    const registerAdminRequest = validate(newAuthAdminSchemaRequest, request);

    console.log(registerAdminRequest);

    if (
      registerAdminRequest.password !== registerAdminRequest.confirmPassword
    ) {
      throw new ResponseError(400, "Passwords do not match");
    }

    // TODO get user by username
    const existingUser = await db.models.userCredentials.findOne(
      {
        where: {
          username: registerAdminRequest.username,
        },
      },
      transaction
    );

    if (existingUser) {
      throw new ResponseError(409, "Admin already exists");
    }

    // TODO hash password
    const hashedPassword = await bcrypt.hash(registerAdminRequest.password, 10);

    // TODO create user credential
    const userCredential = await db.models.userCredentials.create(
      {
        id: uuid().toString(),
        username: registerAdminRequest.username,
        email: registerAdminRequest.email,
        password: hashedPassword,
        created_at: new Date(),
      },
      {
        transaction,
      }
    );

    const role = await roleService.getByRoleName("ADMIN", transaction);

    await db.models.user_roles.create(
      {
        user_id: userCredential.id,
        role_id: role.id,
        created_at: new Date(),
      },
      {
        transaction,
      }
    );

    // TODO get admin by pin
    const existingAdmin = await adminService.getByPin(
      registerAdminRequest.pin,
      transaction
    );

    if (existingAdmin) {
      throw new ResponseError(409, "Admin already exists");
    }

    // TODO create admin
    const admin = {
      id: uuid().toString(),
      fullName: registerAdminRequest.fullName,
      callName: registerAdminRequest.callName,
      pin: registerAdminRequest.pin,
      phoneNumber: registerAdminRequest.phoneNumber,
      userId: userCredential.id,
      createdAt: new Date(),
    };

    const createdAdmin = await adminService.create(admin, transaction);

    // TODO generate token
    const token = jwt.sign(
      {
        id: userCredential.id,
        username: userCredential.username,
        email: userCredential.email,
        role: role.role,
      },
      process.env.EMAIL_JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "7d",
        subject: userCredential.username,
      }
    );

    const link = `${protocol}://${host}/api/v1/auth/activate-account/${token}`;

    // TODO send email
    await sendEmailRegistration(
      userCredential.email,
      "Please activate your account",
      link
    );

    // TODO commit transaction
    await transaction.commit();

    // TODO return response
    return toAdminResponse(createdAdmin, userCredential, role);
  } catch (error) {
    if (transaction) {
      transaction.rollback();
    }

    throw new ResponseError(error.status, error.message);
  }
};

const loginAdmin = async (request) => {
  let transaction;

  try {
    transaction = await db.transaction();

    const loginAdminRequest = validate(loginAdminSchemaRequest, request);

    // TODO get user credential by username
    const userCredential = await db.models.userCredentials.findOne(
      {
        where: {
          username: loginAdminRequest.username,
        },
      },
      transaction
    );

    if (!userCredential) {
      throw new ResponseError(404, "User not found");
    } else if (!userCredential.activated) {
      throw new ResponseError(
        401,
        "Admin not activated, please check your email"
      );
    }

    // TODO compare password
    const isPasswordValid = await bcrypt.compare(
      loginAdminRequest.password,
      userCredential.password
    );

    if (!isPasswordValid) {
      throw new ResponseError(401, "Authentication failed");
    }

    let authorities = [];

    const roles = await userCredential.getUserRoles();

    const role = roles.find((role) => role.role === "ADMIN");

    authorities.push(role.role.toUpperCase());

    if (!role.role) {
      throw new ResponseError(
        401,
        "Authentication failed for role: " + role.role
      );
    }

    // TODO get admin by pin
    const admin = await adminService.getByPin(
      loginAdminRequest.pin,
      transaction
    );

    if (!admin) {
      throw new ResponseError(401, "Authentication failed");
    }

    // TODO generate access token
    const accessToken = jwt.sign(
      {
        id: userCredential.id,
        username: userCredential.username,
        email: userCredential.email,
        role: role.role,
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: process.env.JWT_EXPIRES_IN,
        subject: userCredential.username,
      }
    );

    // TODO generate refresh token
    const refreshToken = jwt.sign(
      {
        id: userCredential.id,
        username: userCredential.username,
        email: userCredential.email,
        role: role.role,
      },
      process.env.JWT_REFRESH_SECRET,
      {
        algorithm: "HS256",
        expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN,
        subject: userCredential.username,
      }
    );

    // TODO update refresh token
    await db.models.userCredentials.update(
      {
        refresh_token: refreshToken,
        updated_at: new Date(),
      },
      {
        where: {
          id: userCredential.id,
        },
      },
      transaction
    );

    // TODO commit transaction
    await transaction.commit();

    // TODO return response
    return {
      username: userCredential.username,
      pin: admin.pin,
      accessToken: accessToken,
      refreshToken: refreshToken,
      roles: authorities,
    };
  } catch (error) {
    if (transaction) {
      transaction.rollback();
    }

    throw new ResponseError(error.status, error.message);
  }
};

const activateAccount = async (token) => {
  let transaction;
  try {
    // TODO start transaction
    transaction = await db.transaction();

    // TODO verify token
    const decoded = jwt.verify(token, process.env.EMAIL_JWT_SECRET);
    const userCredential = await db.models.userCredentials.findOne({
      where: {
        id: decoded.id,
      },
      transaction,
    });

    if (!userCredential) {
      throw new ResponseError(404, "User not found");
    } else if (decoded.exp < Date.now() / 1000) {
      throw new ResponseError(401, "Token expired");
    }

    // TODO activate user
    await db.models.userCredentials.update(
      {
        activated: true,
      },
      {
        where: {
          id: userCredential.id,
        },
        transaction,
      }
    );

    // TODO commit transaction
    await transaction.commit();
  } catch (error) {
    if (transaction) {
      transaction.rollback();
    }
    throw new ResponseError(error.status, error.message);
  }
};

const forgetPassword = async (request, protocol, host) => {
  let transaction;
  try {
    transaction = await db.transaction();

    const forgetPasswordRequest = validate(
      forgetPasswordSchemaRequest,
      request
    );

    const userCredential = await db.models.userCredentials.findOne({
      where: {
        username: forgetPasswordRequest.username,
      },
      transaction,
    });

    if (!userCredential) {
      throw new ResponseError(404, "User not found");
    }

    if (!userCredential.activated) {
      throw new ResponseError(
        401,
        "User not activated, please check your email"
      );
    }

    const forgetPasswordToken = jwt.sign(
      {
        id: userCredential.id,
        username: userCredential.username,
        email: userCredential.email,
        role: userCredential.role,
      },
      process.env.FORGET_PASSWORD_JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "5m",
        subject: userCredential.username,
      }
    );

    const link = `${protocol}://${host}/api/v1/auth/reset-password/${userCredential.id}/${forgetPasswordToken}`;

    // TODO send email
    await sendEmailForgotPassword(
      userCredential.email,
      "Reset your password",
      link
    );

    await transaction.commit();
  } catch (error) {
    if (transaction) {
      transaction.rollback();
    }
    throw new ResponseError(error.status, error.message);
  }
};

const getResetPassword = async (id, token) => {
  let transaction;
  try {
    transaction = await db.transaction();

    const decoded = jwt.verify(token, process.env.FORGET_PASSWORD_JWT_SECRET);

    const userCredential = await db.models.userCredentials.findOne({
      where: {
        username: decoded.username,
      },
      transaction,
    });

    if (!userCredential) {
      throw new ResponseError(404, "User not found");
    } else if (!userCredential.activated) {
      throw new ResponseError(
        401,
        "User not activated, please check your email"
      );
    } else if (decoded.exp < Date.now() / 1000) {
      throw new ResponseError(401, "Token expired");
    } else if (id !== userCredential.id) {
      throw new ResponseError(404, "User not found");
    }

    await transaction.commit();

    return {
      username: userCredential.username,
      email: userCredential.email,
      token: token,
    };
  } catch (error) {
    if (transaction) {
      transaction.rollback();
    }

    throw new ResponseError(error.status, error.message);
  }
};

const resetPassword = async (request, token) => {
  let transaction;
  try {
    transaction = await db.transaction();

    if (!token) {
      throw new ResponseError(400, "Token not found");
    }

    const resetPasswordRequest = validate(resetPasswordSchemaRequest, request);

    if (
      resetPasswordRequest.password !== resetPasswordRequest.confirmPassword
    ) {
      throw new ResponseError(400, "Password and confirm password not match");
    }

    const hashedPassword = await bcrypt.hash(resetPasswordRequest.password, 10);

    const decoded = jwt.verify(token, process.env.FORGET_PASSWORD_JWT_SECRET);

    const userCredential = await db.models.userCredentials.findOne({
      where: {
        username: decoded.username,
      },
      transaction,
    });

    if (!userCredential) {
      throw new ResponseError(404, "User not found");
    } else if (!userCredential.activated) {
      throw new ResponseError(
        401,
        "User not activated, please check your email"
      );
    } else if (decoded.exp < Date.now() / 1000) {
      throw new ResponseError(401, "Token expired");
    } else if (decoded.id !== userCredential.id) {
      throw new ResponseError(404, "User not found");
    }

    await db.models.userCredentials.update(
      {
        password: hashedPassword,
      },
      {
        where: {
          id: userCredential.id,
        },
        transaction,
      }
    );

    await transaction.commit();

    return {
      username: userCredential.username,
      email: userCredential.email,
    };
  } catch (error) {
    if (transaction) {
      transaction.rollback();
    }

    throw new ResponseError(error.status, error.message);
  }
};

const changePassword = async (request) => {
  let transaction;
  try {
    transaction = await db.transaction();

    const changePasswordRequest = validate(
      changePasswordSchemaRequest,
      request
    );

    const userCredential = await db.models.userCredentials.findOne({
      where: {
        id: changePasswordRequest.id,
      },
      transaction,
    });

    const passwordMatch = await bcrypt.compare(
      changePasswordRequest.oldPassword,
      userCredential.password
    );

    if (!userCredential) {
      throw new ResponseError(404, "User not found");
    } else if (!userCredential.activated) {
      throw new ResponseError(
        401,
        "User not activated, please check your email"
      );
    } else if (!passwordMatch) {
      throw new ResponseError(401, "Old password not match");
    } else if (
      changePasswordRequest.newPassword !==
      changePasswordRequest.confirmPassword
    ) {
      throw new ResponseError(400, "Password and confirm password not match");
    }

    const hashedPassword = bcrypt.hashSync(
      changePasswordRequest.newPassword,
      10
    );

    const updatedUserCredential = await db.models.userCredentials.update(
      {
        password: hashedPassword,
      },
      {
        where: {
          id: changePasswordRequest.id,
        },
        transaction,
      }
    );

    if (!updatedUserCredential) {
      throw new ResponseError(404, "User not found");
    }

    await transaction.commit();

    return {
      username: userCredential.username,
      email: userCredential.email,
    };
  } catch (error) {
    if (transaction) {
      transaction.rollback();
    }

    throw new ResponseError(error.status, error.message);
  }
};

const refreshToken = async (request) => {
  try {
    // TODO find user credential by request cookie with name "refreshToken"
    const userCredential = await db.models.userCredentials.findOne({
      where: {
        refresh_token: request,
      },
    });

    if (!userCredential) {
      throw new ResponseError(401, "Authentication failed");
    }

    const decode = jwt.verify(request, process.env.JWT_REFRESH_SECRET);

    console.log("decode = {}", decode);

    const id = decode.id;
    const username = decode.username;
    const email = decode.email;
    const role = decode.role;

    const accessToken = jwt.sign(
      {
        id: id,
        username: username,
        email: email,
        role: role,
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: process.env.JWT_EXPIRES_IN,
        subject: username,
      }
    );

    return {
      accessToken: accessToken,
    };
  } catch (error) {
    throw new ResponseError(error.status, error.message);
  }
};

const logout = async (refreshToken) => {
  if (!refreshToken) {
    throw new ResponseError(204, "no content of refresh token");
  }

  // TODO find user credential by request cookie with name "refreshToken"
  const userCredential = await db.models.userCredentials.findOne({
    where: {
      refresh_token: refreshToken,
    },
  });

  if (!userCredential) {
    throw new ResponseError(204, "no content of user credential");
  }

  // TODO update user credentials with refresh token
  await db.models.userCredentials.update(
    {
      refresh_token: null,
    },
    {
      where: {
        id: userCredential.id,
      },
    }
  );

  return;
};

// TODO to register cashier response
const toRegisterCashierResponse = (cashier, userCredential, role) => {
  return {
    cashierId: cashier.id,
    fullName: cashier.full_name,
    callName: cashier.call_name,
    phoneNumber: cashier.phone_number,
    street: cashier.street,
    city: cashier.city,
    province: cashier.province,
    country: cashier.country,
    postalCode: cashier.postal_code,
    created_at: cashier.created_at,
    updated_at: cashier.updated_at !== null ? cashier.updated_at : null,
    userCredential: {
      username: userCredential.username,
      email: userCredential.email,
      activated: userCredential.activated,
    },
    roles: [role.role],
  };
};

// TODO to admin response
const toAdminResponse = (admin, userCredential, role) => {
  return {
    adminId: admin.id,
    fullName: admin.full_name,
    callName: admin.call_name,
    pin: admin.pin,
    phoneNumber: admin.phone_number,
    createdAt: admin.created_at,
    updatedAt: admin.updated_at !== null ? admin.updated_at : null,
    userCredential: {
      username: userCredential.username,
      email: userCredential.email,
      activated: userCredential.activated,
    },
    roles: [role.role],
  };
};

export default {
  registerCashier,
  loginCashier,
  registerAdmin,
  loginAdmin,
  forgetPassword,
  getResetPassword,
  resetPassword,
  activateAccount,
  changePassword,
  refreshToken,
  logout,
};
