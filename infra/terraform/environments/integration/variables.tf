variable "aws_region" {
  description = "AWS region for the integration environment."
  type        = string
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "integration"
}
