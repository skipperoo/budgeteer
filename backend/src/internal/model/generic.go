package model

type Details struct {
	Details string `json:"details"`
}

type Error struct {
	Error string `json:"error"`
}

type UserClaims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role,omitempty"`
}

type PaginatedResponse struct {
	Data       any       `json:"data"`
	NextCursor *string   `json:"next_cursor,omitempty"`
	HasMore    bool      `json:"has_more"`
}
