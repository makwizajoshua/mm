declare global {
    namespace Express {
        interface AccessContext {
            isAdmin: boolean;
            roles: string[];
            /** Stores the user may work in; null means every store of the company. */
            storeIds: number[] | null;
            employee: { id: number; firstName: string; lastName: string; employeeNumber: string } | null;
        }
        interface Request {
            user: {
                id: number;
            };
            tenantId?: number;
            access?: AccessContext;
        }
    }
}

export {};
