import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type { ReactNode } from "react";

// Один QueryClient на всё приложение: в нём живёт кэш всех запросов.
// Создаётся вне компонента, чтобы не пересоздаваться (и не терять кэш) при каждом рендере.
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // При ошибке повторить запрос 1 раз (по умолчанию 3)
            retry: 1,
            // 30 секунд данные считаются свежими — повторного запроса на сервер не будет
            staleTime: 30_000,
            // Не перезапрашивать данные каждый раз, когда пользователь возвращается на вкладку
            refetchOnWindowFocus: false,
        },
    },
})

// Обёртка, которая даёт всем дочерним компонентам доступ к useQuery / useMutation
const QueryProvider = ({ children }: { children: ReactNode }) => {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
};

export default QueryProvider;
