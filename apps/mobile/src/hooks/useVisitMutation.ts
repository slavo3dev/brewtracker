import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";


type UseVisitMutationParams<TVisit> = {
  activeVisit: TVisit | null;
  setActiveVisit: Dispatch<SetStateAction<TVisit | null>>;
  persistVisit: (visit: TVisit) => Promise<void>;
  getVisitId?: (visit: TVisit) => string;
  getVisitUserId?: (visit: TVisit) => string;
  authenticatedUserId?: string | null;
  authGeneration?: number;
  getAuthGeneration?: () => number;
};

export function useVisitMutation<TVisit>({
  activeVisit,
  setActiveVisit,
  persistVisit,
  getVisitId,
  getVisitUserId,
  authenticatedUserId,
  authGeneration,
  getAuthGeneration,
}: UseVisitMutationParams<TVisit>) {
  const activeVisitRef = useRef<TVisit | null>(activeVisit);

  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const authenticatedUserIdRef = useRef(authenticatedUserId);
  const authGenerationRef = useRef(authGeneration);
  const getAuthGenerationRef = useRef(getAuthGeneration);

  authenticatedUserIdRef.current = authenticatedUserId;
  authGenerationRef.current = authGeneration;
  getAuthGenerationRef.current = getAuthGeneration;

  const readAuthGeneration = useCallback(
    () => getAuthGenerationRef.current?.() ?? authGenerationRef.current,
    [],
  );

  useEffect(() => {
    activeVisitRef.current = activeVisit;
  }, [activeVisit]);

  const commitVisitMutation = useCallback(
    (
      mutation: (
        currentVisit: TVisit,
      ) => TVisit | Promise<TVisit>,
    ): Promise<TVisit> => {
      const requestedVisit = activeVisitRef.current;
      const requestedUserId = authenticatedUserIdRef.current;
      const requestedGeneration = readAuthGeneration();

      if (getVisitUserId && (
        !requestedUserId ||
        !requestedVisit ||
        getVisitUserId(requestedVisit) !== requestedUserId
      )) {
        return Promise.reject(
          new Error("The active service visit does not belong to the authenticated user."),
        );
      }

      if (!requestedVisit) {
        return Promise.reject(
          new Error("There is no active service visit."),
        );
      }

      const expectedVisitId = getVisitId
        ? getVisitId(requestedVisit)
        : null;

      const operation = mutationQueueRef.current.then(async () => {
        if (readAuthGeneration() !== requestedGeneration) {
          throw new Error(
            "The authentication session changed before the visit mutation.",
          );
        }

        const currentVisit = activeVisitRef.current;

        if (getVisitUserId && (
          !requestedUserId ||
          authenticatedUserIdRef.current !== requestedUserId ||
          !currentVisit ||
          getVisitUserId(currentVisit) !== requestedUserId
        )) {
          throw new Error("The authenticated user changed before the visit mutation.");
        }

        if (
          expectedVisitId !== null &&
          currentVisit &&
          getVisitId &&
          getVisitId(currentVisit) !== expectedVisitId
        ) {
          throw new Error(
            "The active service visit changed before this operation could run.",
          );
        }

        if (!currentVisit) {
          throw new Error("There is no active service visit.");
        }

        const updatedVisit = await mutation(currentVisit);

        if (readAuthGeneration() !== requestedGeneration) {
          throw new Error(
            "The authentication session changed during the visit mutation.",
          );
        }

        if (getVisitUserId && (
          authenticatedUserIdRef.current !== requestedUserId ||
          getVisitUserId(updatedVisit) !== requestedUserId
        )) {
          throw new Error("The authenticated user changed during the visit mutation.");
        }

        if (activeVisitRef.current !== currentVisit) {
          throw new Error(
            "The active service visit was updated while this operation was running.",
          );
        }

        if (
          getVisitId &&
          getVisitId(updatedVisit) !== getVisitId(currentVisit)
        ) {
          throw new Error(
            "A visit mutation cannot change the active visit identity.",
          );
        }

        await persistVisit(updatedVisit);

        if (readAuthGeneration() !== requestedGeneration) {
          throw new Error(
            "The authentication session changed while saving the visit.",
          );
        }

        if (activeVisitRef.current !== currentVisit) {
          throw new Error(
            "The active service visit changed while saving the mutation.",
          );
        }

        activeVisitRef.current = updatedVisit;
        setActiveVisit(updatedVisit);

        return updatedVisit;
      });

      /*
       * Prevent a rejected mutation from
       * permanently rejecting the queue.
       */
      mutationQueueRef.current = operation.then(
        () => undefined,
        () => undefined,
      );

      return operation;
    },
    [persistVisit, setActiveVisit, getVisitId, getVisitUserId],
  );

  const readCurrentVisit = useCallback(
    (): Promise<TVisit | null> => {
      const requestedGeneration = readAuthGeneration();
      const requestedUserId = authenticatedUserIdRef.current;

      return mutationQueueRef.current.then(() => {
        if (
          readAuthGeneration() !== requestedGeneration ||
          authenticatedUserIdRef.current !== requestedUserId
        ) {
          throw new Error(
            "The authentication session changed before reading the visit.",
          );
        }

        const currentVisit = activeVisitRef.current;

        if (
          currentVisit &&
          getVisitUserId &&
          (!requestedUserId ||
            getVisitUserId(currentVisit) !== requestedUserId)
        ) {
          throw new Error(
            "The active visit does not belong to the authenticated user.",
          );
        }

        return currentVisit;
      });
    },
    [getVisitUserId, readAuthGeneration],
  );

  const runVisitLifecycle = useCallback(
    (
      operation: (currentVisit: TVisit | null) => Promise<TVisit | null>,
    ): Promise<TVisit | null> => {
      const requestedGeneration = readAuthGeneration();
      const requestedUserId = authenticatedUserIdRef.current;

      const queuedOperation = mutationQueueRef.current.then(async () => {
        if (
          readAuthGeneration() !== requestedGeneration ||
          authenticatedUserIdRef.current !== requestedUserId
        ) {
          throw new Error(
            "The authentication session changed before the visit lifecycle operation.",
          );
        }

        const nextVisit = await operation(activeVisitRef.current);

        if (
          readAuthGeneration() !== requestedGeneration ||
          authenticatedUserIdRef.current !== requestedUserId
        ) {
          throw new Error(
            "The authentication session changed during the visit lifecycle operation.",
          );
        }

        activeVisitRef.current = nextVisit;
        setActiveVisit(nextVisit);

        return nextVisit;
      });

      mutationQueueRef.current = queuedOperation.then(
        () => undefined,
        () => undefined,
      );

      return queuedOperation;
    },
    [setActiveVisit],
  );

  return {
    commitVisitMutation,
    runVisitLifecycle,
    readCurrentVisit
  };
}
