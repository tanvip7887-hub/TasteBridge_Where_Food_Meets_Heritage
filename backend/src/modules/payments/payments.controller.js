import { HTTP_STATUS } from "../../constants/index.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { paymentsService } from "./payments.service.js";

export const initiateOnlineCheckout = async (req, res, next) => {
  try {
    const result = await paymentsService.initiateOnlineCheckout(req.user.id, req.body);
    return sendSuccess(res, HTTP_STATUS.CREATED, "Online payment checkout initiated", result);
  } catch (error) { next(error); }
};

export const getPaymentAttempt = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Payment attempt retrieved", await paymentsService.getAttempt(req.user.id, req.params.id));
  } catch (error) { next(error); }
};

export const confirmPaymentAttempt = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Mock payment confirmation processed", await paymentsService.confirmAttempt(req.user.id, req.params.id, req.body));
  } catch (error) { next(error); }
};

export const cancelPaymentAttempt = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Payment attempt cancelled", await paymentsService.cancelAttempt(req.user.id, req.params.id));
  } catch (error) { next(error); }
};
