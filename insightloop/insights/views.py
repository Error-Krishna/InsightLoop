from django.shortcuts import render, redirect
from upload.models import BusinessData
from .models import Insight # Fixed import
import json
from django.http import HttpResponse
import csv
from io import StringIO
from django.contrib import messages
from datetime import datetime, timedelta
import numpy as np
from collections import defaultdict
from mongoengine.queryset.visitor import Q

def delete_insight(request, insight_id):
    try:
        insight = Insight.objects.get(id=insight_id)
        insight.delete()
        messages.success(request, f"Deleted insight: {insight.title}")
    except Insight.DoesNotExist:
        messages.error(request, "Insight not found")
    return redirect('insights')

def delete_all_insights(request):
    """Delete all insights"""
    count = Insight.objects.count()
    Insight.objects.delete()
    messages.success(request, f"Deleted {count} insights")
    return redirect('insights')

def delete_old_insights(days=30):
    """Automatically delete insights older than X days"""
    cutoff_date = datetime.now() - timedelta(days=days)
    old_insights = Insight.objects(created_at__lt=cutoff_date)
    count = old_insights.count()
    old_insights.delete()
    return count





def insights(request):
    # Auto-delete insights older than 30 days before any processing
    deleted_count = delete_old_insights(days=30)
    if deleted_count > 0:
        messages.info(request, f"Auto-deleted {deleted_count} old insights")
    
   # Get all insights ordered by creation date
    all_insights = Insight.objects.order_by('-created_at')
    main_insight = all_insights.first() if all_insights else None
    insight_gallery = list(all_insights)

    # Handle single insight deletion
    if request.method == 'POST' and 'delete_insight_id' in request.POST:
        insight_id = request.POST.get('delete_insight_id')
        try:
            insight = Insight.objects.get(id=insight_id)
            insight.delete()
            messages.success(request, f"Deleted insight: {insight.title}")
            return redirect('insights')
        except Insight.DoesNotExist:
            messages.error(request, "Insight not found")
    
    # Handle insight creation based on data analysis
    if request.method == 'POST' and 'analyze_data' in request.POST:
        try:
            insights_list = analyze_sales_data()
            
            if insights_list:
                for insight_data in insights_list:
                    Insight(
                        title=insight_data['title'],
                        description=insight_data['description'],
                        labels=insight_data['labels'],
                        data_points=insight_data['data_points']
                    ).save()
                messages.success(request, f"Created {len(insights_list)} new insights!")
            else:
                messages.info(request, "No significant insights found. Try adding more sales data.")
                
            return redirect('insights')
        except Exception as e:
            messages.error(request, f"Analysis failed: {str(e)}")
            import traceback
            traceback.print_exc()
    # Handle delete all request
    if request.method == 'POST' and 'delete_all' in request.POST:
        return delete_all_insights(request)
    # Handle note saving
    if request.method == 'POST' and 'insight_id' in request.POST:
        insight_id = request.POST.get('insight_id')
        note = request.POST.get('note', '')
        
        try:
            insight = Insight.objects.get(id=insight_id)
            insight.note = note
            insight.save()
            messages.success(request, "Note saved successfully!")
            return redirect('insights')
        except Insight.DoesNotExist:
            messages.error(request, "Insight not found")
    
    # Handle export request
    if request.method == 'POST' and 'export_insight_id' in request.POST:
        insight_id = request.POST.get('export_insight_id')
        try:
            insight = Insight.objects.get(id=insight_id)
            return export_insight(insight)
        except Insight.DoesNotExist:
            messages.error(request, "Insight not found")
            return redirect('insights')
    
    # Prepare chart data
    chart_data = {}
    if main_insight:
        chart_data = {
            'labels': main_insight.labels,
            'data': main_insight.data_points
        }
    
    context = {
        'main_insight': main_insight,
        'insight_gallery': list(all_insights),  # Pass all insights to template
        'chart_data': json.dumps(chart_data) if chart_data else None,
        'all_insights_json': json.dumps([{
            'id': str(i.id),
            'title': i.title,
            'description': i.description,
            'labels': i.labels,
            'data_points': i.data_points,
            'created_at': i.created_at.strftime("%Y-%m-%d %H:%M:%S") if i.created_at else "Not Available",
            'note': i.note or ''
        } for i in all_insights])  # Serialize all insights for JavaScript
    }
    return render(request, 'insights/InsightDetails.html', context)

def analyze_sales_data():
    """Analyze BusinessData to generate insights"""
    insights_list = []
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=90)
    
    # Query business data
    biz_data = BusinessData.objects(
        date__gte=start_date,
        date__lte=end_date
    ).only('date', 'product', 'quantity', 'selling_price')
    
    if not biz_data:
        return insights_list
    
    # Aggregate sales by day and product
    daily_sales = defaultdict(float)
    product_sales = defaultdict(float)
    
    for record in biz_data:
        revenue = record.quantity * record.selling_price
        daily_sales[record.date] += revenue
        product_sales[record.product] += revenue
    
    # Convert to sorted lists
    dates = sorted(daily_sales.keys())
    amounts = [daily_sales[date] for date in dates]
    
    # 1. Detect significant spikes/drops
    if len(amounts) >= 5:
        moving_avg = []
        for i in range(len(amounts)):
            window = amounts[max(0, i-2):i+1]
            moving_avg.append(sum(window) / len(window))
        
        std_dev = np.std(amounts) if amounts else 0
        threshold = max(0.5 * std_dev, 5)
        
        for i in range(2, len(amounts)):
            deviation = amounts[i] - moving_avg[i]
            if abs(deviation) > threshold:
                insight_type = "spike" if deviation > 0 else "drop"
                insight_title = f"Sales {insight_type.capitalize()} on {dates[i].strftime('%b %d')}"
                insight_desc = (
                    f"Detected sales {insight_type} (${amounts[i]:.2f}) vs "
                    f"${moving_avg[i]:.2f} average (Δ${abs(deviation):.2f})"
                )
                
                start_idx = max(0, i-2)
                end_idx = min(len(dates), i+3)
                
                insights_list.append({
                    'title': insight_title,
                    'description': insight_desc,
                    'labels': [d.strftime('%m/%d') for d in dates[start_idx:end_idx]],
                    'data_points': amounts[start_idx:end_idx]
                })
    
    # 2. Product performance
    if product_sales:
        sorted_products = sorted(product_sales.items(), key=lambda x: x[1], reverse=True)
        num_products = min(5, len(sorted_products))
        top_products = sorted_products[:num_products]
        
        insight_title = "Top Performing Products"
        insight_desc = f"{top_products[0][0]} is the top performer with ${top_products[0][1]:.2f} in sales"
        
        insights_list.append({
            'title': insight_title,
            'description': insight_desc,
            'labels': [p[0] for p in top_products],
            'data_points': [p[1] for p in top_products]
        })
    
    return insights_list

def export_insight(insight):
    """Create a CSV export of the insight"""
    # Create a CSV in memory
    csv_buffer = StringIO()
    writer = csv.writer(csv_buffer)
    
    # Write header
    writer.writerow(['Insight Title', 'Description', 'Note'])
    writer.writerow([insight.title, insight.description, insight.note or ''])
    writer.writerow([])
    
    # Write chart data
    writer.writerow(['Period', 'Value'])
    for label, value in zip(insight.labels, insight.data_points):
        writer.writerow([label, value])
    
    # Create HTTP response
    response = HttpResponse(csv_buffer.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="insight_{insight.id}.csv"'
    return response