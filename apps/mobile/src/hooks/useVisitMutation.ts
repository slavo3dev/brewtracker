import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import { saveServiceVisit } from "../../src/features/service-visit/service-visit.storage";
import type { ServiceVisit } from "../../src/features/service-visit/service-visit.types";

type UseVisitMutationParams = {
  activeVisit: ServiceVisit | null;
  setActiveVisit: Dispatch<SetStateAction<ServiceVisit | null>>;
};

export function useVisitMutation({
  activeVisit,
  setActiveVisit,
}: UseVisitMutationParams) {
  const activeVisitRef = useRef<ServiceVisit | null>(activeVisit);

  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    activeVisitRef.current = activeVisit;
  }, [activeVisit]);

  const commitVisitMutation = useCallback(
    (
      mutation: (
        currentVisit: ServiceVisit,
      ) => ServiceVisit | Promise<ServiceVisit>,
    ): Promise<ServiceVisit> => {
      const operation = mutationQueueRef.current.then(async () => {
        const currentVisit = activeVisitRef.current;

        if (!currentVisit) {
          throw new Error("There is no active service visit.");
        }

        const updatedVisit = await mutation(currentVisit);

        await saveServiceVisit(updatedVisit);

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
    [setActiveVisit],
  );

  return {
    commitVisitMutation,
  };
}
