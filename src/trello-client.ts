import axios, { AxiosInstance } from 'axios';
import {
  TrelloConfig,
  TrelloCard,
  TrelloList,
  TrelloAction,
  TrelloAttachment,
  AttachmentParams,
} from './types.js';
import { createTrelloRateLimiters } from './rate-limiter.js';

export class TrelloClient {
  private axiosInstance: AxiosInstance;
  private rateLimiter;

  constructor(private config: TrelloConfig) {
    this.axiosInstance = axios.create({
      baseURL: 'https://api.trello.com/1',
      params: {
        key: config.apiKey,
        token: config.token,
      },
    });

    this.rateLimiter = createTrelloRateLimiters();

    // Add rate limiting interceptor
    this.axiosInstance.interceptors.request.use(async config => {
      await this.rateLimiter.waitForAvailable();
      return config;
    });
  }

  private async handleRequest<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          // Rate limit exceeded, wait and retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          return this.handleRequest(request);
        }
        throw new Error(`Trello API error: ${error.response?.data?.message ?? error.message}`);
      }
      throw error;
    }
  }

  async getCardsByList(listId: string): Promise<TrelloCard[]> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.get(`/lists/${listId}/cards`);
      return response.data;
    });
  }

  async getLists(): Promise<TrelloList[]> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.get(`/boards/${this.config.boardId}/lists`);
      return response.data;
    });
  }

  async getRecentActivity(limit: number = 10): Promise<TrelloAction[]> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.get(`/boards/${this.config.boardId}/actions`, {
        params: { limit },
      });
      return response.data;
    });
  }

  async addCard(params: {
    listId: string;
    name: string;
    description?: string;
    dueDate?: string;
    labels?: string[];
  }): Promise<TrelloCard> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.post('/cards', {
        idList: params.listId,
        name: params.name,
        desc: params.description,
        due: params.dueDate,
        idLabels: params.labels,
      });
      return response.data;
    });
  }

  async updateCard(params: {
    cardId: string;
    name?: string;
    description?: string;
    dueDate?: string;
    labels?: string[];
  }): Promise<TrelloCard> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.put(`/cards/${params.cardId}`, {
        name: params.name,
        desc: params.description,
        due: params.dueDate,
        idLabels: params.labels,
      });
      return response.data;
    });
  }

  async archiveCard(cardId: string): Promise<TrelloCard> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.put(`/cards/${cardId}`, {
        closed: true,
      });
      return response.data;
    });
  }

  async addList(name: string): Promise<TrelloList> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.post('/lists', {
        name,
        idBoard: this.config.boardId,
      });
      return response.data;
    });
  }

  async archiveList(listId: string): Promise<TrelloList> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.put(`/lists/${listId}/closed`, {
        value: true,
      });
      return response.data;
    });
  }

  async getMyCards(): Promise<TrelloCard[]> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.get('/members/me/cards');
      return response.data;
    });
  }

  async addAttachment(params: AttachmentParams): Promise<TrelloAttachment> {
    return this.handleRequest(async () => {
      if (params.url) {
        // Add URL attachment
        const response = await this.axiosInstance.post(`/cards/${params.cardId}/attachments`, {
          url: params.url,
          name: params.name,
        });
        return response.data;
      } else if (params.file) {
        // Add file attachment
        const formData = new FormData();
        if (params.name) formData.append('name', params.name);
        formData.append('file', params.file);

        const response = await this.axiosInstance.post(
          `/cards/${params.cardId}/attachments`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          }
        );
        return response.data;
      }
      throw new Error('Either url or file must be provided');
    });
  }

  async getAttachments(cardId: string): Promise<TrelloAttachment[]> {
    return this.handleRequest(async () => {
      const response = await this.axiosInstance.get(`/cards/${cardId}/attachments`);
      return response.data;
    });
  }
}
