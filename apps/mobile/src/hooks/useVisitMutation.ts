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
};

export function useVisitMutation<TVisit>({
  activeVisit,
  setActiveVisit,
  persistVisit,
}: UseVisitMutationParams<TVisit>) {
  const activeVisitRef = useRef<TVisit | null>(activeVisit);

  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    activeVisitRef.current = activeVisit;
  }, [activeVisit]);

  const commitVisitMutation = useCallback(
    (
      mutation: (
        currentVisit: TVisit,
      ) => TVisit | Promise<TVisit>,
    ): Promise<TVisit> => {
      const operation = mutationQueueRef.current.then(async () => {
        const currentVisit = activeVisitRef.current;

        if (!currentVisit) {
          throw new Error("There is no active service visit.");
        }

        const updatedVisit = await mutation(currentVisit);

        await persistVisit(updatedVisit);

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
    [persistVisit, setActiveVisit],
  );

  return {
    commitVisitMutation,
  };
}
