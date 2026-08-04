import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { handleGetMe } from '../routes/me';
import {
  handleListAccounts,
  handleCreateAccount,
  handleUpdateAccount,
  handleDeleteAccount,
} from '../routes/accounts';
import {
  handleListCategories,
  handleCreateCategory,
  handleUpdateCategory,
  handleDeleteCategory,
} from '../routes/categories';
import {
  handleListTransactions,
  handleCreateTransaction,
  handleUpdateTransaction,
  handleDeleteTransaction,
} from '../routes/transactions';
import { handleGetSummary } from '../routes/summary';
import { handleUpsertBudget, handleDeleteBudget } from '../routes/budgets';
import {
  handleListSchedules,
  handleCreateSchedule,
  handleUpdateSchedule,
  handleDeleteSchedule,
  handleGenerateExpected,
} from '../routes/schedules';
import { handlePresign } from '../routes/presign';
import { errorResponse } from '../utils/response';

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  const { routeKey } = event;

  try {
    switch (routeKey) {
      case 'GET /me':
        return await handleGetMe(event);

      case 'GET /accounts':
        return await handleListAccounts(event);
      case 'POST /accounts':
        return await handleCreateAccount(event);
      case 'PUT /accounts/{id}':
        return await handleUpdateAccount(event);
      case 'DELETE /accounts/{id}':
        return await handleDeleteAccount(event);

      case 'GET /categories':
        return await handleListCategories(event);
      case 'POST /categories':
        return await handleCreateCategory(event);
      case 'PUT /categories/{id}':
        return await handleUpdateCategory(event);
      case 'DELETE /categories/{id}':
        return await handleDeleteCategory(event);

      case 'GET /transactions':
        return await handleListTransactions(event);
      case 'POST /transactions':
        return await handleCreateTransaction(event);
      case 'PUT /transactions/{id}':
        return await handleUpdateTransaction(event);
      case 'DELETE /transactions/{id}':
        return await handleDeleteTransaction(event);

      case 'GET /summary':
        return await handleGetSummary(event);

      case 'PUT /budgets':
        return await handleUpsertBudget(event);
      case 'DELETE /budgets/{categoryId}/{period}':
        return await handleDeleteBudget(event);

      case 'GET /schedules':
        return await handleListSchedules(event);
      case 'POST /schedules':
        return await handleCreateSchedule(event);
      case 'PUT /schedules/{id}':
        return await handleUpdateSchedule(event);
      case 'DELETE /schedules/{id}':
        return await handleDeleteSchedule(event);
      case 'POST /schedules/generate':
        return await handleGenerateExpected(event);

      case 'POST /uploads/presign':
        return await handlePresign(event);

      default:
        return errorResponse(404, 'NOT_FOUND', 'Route not found');
    }
  } catch (err) {
    // Log full detail to CloudWatch; never expose internals to the client (§9).
    console.error('Unhandled error:', err);
    return errorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
