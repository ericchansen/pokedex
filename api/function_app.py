"""Azure Functions entry point — registers all API blueprints."""
import json

import azure.functions as func
from builds import bp as builds_bp
from inventory import bp as inventory_bp
from teams import bp as teams_bp

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# Register blueprints
app.register_functions(builds_bp)
app.register_functions(teams_bp)
app.register_functions(inventory_bp)


# Health endpoint (anonymous, no auth required)
@app.function_name("health")
@app.route(route="health", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def health(req: func.HttpRequest) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps({"status": "ok"}),
        status_code=200,
        mimetype="application/json",
    )
