from django import template

register = template.Library()

@register.filter
def sum_quantities(batches):
    return sum(batch.get('quantity', 0) for batch in batches)

@register.filter
def subtract(value, arg):
    return value - arg

@register.filter
def multiply(value, arg):
    return value * arg

# New filters for direct property access
@register.filter
def get_delivered_total(assignment):
    return assignment.delivered_quantity

@register.filter
def get_balance(assignment):
    return assignment.balance_quantity