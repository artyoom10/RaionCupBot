import type { Json } from "./json";

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      publish_match_result: {
        Args: {
          p_actor_user_id: string;
          p_match_id: string;
          p_result_type: string;
          p_goal_events: Json;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      replace_match_result: {
        Args: {
          p_actor_user_id: string;
          p_match_id: string;
          p_result_type: string;
          p_goal_events: Json;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      transfer_player: {
        Args: {
          p_actor_user_id: string;
          p_player_id: string;
          p_to_team_id: string;
        };
        Returns: Json;
      };
      deactivate_or_delete_player: {
        Args: {
          p_actor_user_id: string;
          p_player_id: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
