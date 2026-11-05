variable "aws_region" {
  description = "AWS region for the production environment."
  type        = string
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "production"
}
