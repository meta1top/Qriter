"use client";

import type { Book, CreateBookInput, UpdateBookInput } from "@qriter/types";
import { apiClient } from "@qriter/web-common";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** 书籍列表 query key。 */
export const booksQueryKey = ["books"] as const;

/** 拉取当前账号的书籍列表。 */
async function fetchBooks(): Promise<Book[]> {
  const { data } = await apiClient.get<Book[]>("/api/books");
  return data;
}

/** 列出我的书。 */
export function useBooks() {
  return useQuery({ queryKey: booksQueryKey, queryFn: fetchBooks });
}

/** 新建书籍。 */
export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBookInput): Promise<Book> => {
      const { data } = await apiClient.post<Book>("/api/books", input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: booksQueryKey }),
  });
}

/** 更新书籍（改名 / 简介 / 状态）。 */
export function useUpdateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      input: UpdateBookInput;
    }): Promise<Book> => {
      const { data } = await apiClient.patch<Book>(
        `/api/books/${args.id}`,
        args.input,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: booksQueryKey }),
  });
}

/** 删除书籍。 */
export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await apiClient.delete(`/api/books/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: booksQueryKey }),
  });
}
