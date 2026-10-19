package com.timetracker;

import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

@Component
public class SpaWebFilter implements WebFilter {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();
        
        // If the route doesn't start with /api and doesn't contain a dot (like .js or .css),
        // we forward it to /index.html so the React Router can handle it on the client side.
        if (!path.startsWith("/api") && !path.contains(".") && path.matches("/(.*)")) {
            return chain.filter(
                exchange.mutate().request(
                    exchange.getRequest().mutate().path("/index.html").build()
                ).build()
            );
        }
        
        return chain.filter(exchange);
    }
}
