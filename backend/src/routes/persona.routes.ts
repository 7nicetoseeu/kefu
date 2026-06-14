import { Router } from "express";
import {
  createPersonaConfig,
  getPersonaConfig,
  listPersonaConfigs,
  updatePersonaConfig,
  updatePersonaConfigStatus,
} from "../services/persona.service.js";
import { ActiveStatus } from "../types.js";
import { asyncHandler, sendSuccess } from "../utils/response.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const data = await listPersonaConfigs(req.query.status as ActiveStatus | undefined);
    sendSuccess(res, data);
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = await createPersonaConfig(req.body);
    sendSuccess(res, data, 201);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = await getPersonaConfig(Number(req.params.id));
    sendSuccess(res, data);
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = await updatePersonaConfig(Number(req.params.id), req.body);
    sendSuccess(res, data);
  }),
);

router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const data = await updatePersonaConfigStatus(Number(req.params.id), req.body.status as ActiveStatus);
    sendSuccess(res, data);
  }),
);

export default router;
